/*
MIT License

Copyright (c) 2022 Backblaze

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

import pkg from 'aws-sdk';
const {Endpoint, S3} = pkg;

import stream from "stream";
import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

const ENV_VARS = [
  "CACHE_DOMAIN",
  "SRC_BUCKET_NAME",
  "SRC_ENDPOINT",
  "SRC_ACCESS_KEY",
  "SRC_SECRET_KEY",
  "DST_BUCKET_NAME",
  "DST_ENDPOINT",
  "DST_ACCESS_KEY",
  "DST_SECRET_KEY",
  "QUEUE_SIZE",
  "PART_SIZE"
];

function checkEnvVars(env_vars) {
  // make sure the environment variables are set
  try {
    env_vars.forEach(element => {
      console.log('checking: ', element);
      if (!process.env[element]) {
        throw(`Environment variable not set: ${element}`);
      }
    })
  } catch(err) {
    console.log('ERROR checkEnvVars: ', err);
    throw({'error': 'internal configuration'});
  }
}

function copyFile(key, cacheDomain, dstService, dstBucket) {
  const srcUrl = `https://${cacheDomain}/${key}`;
  const headers = {'X-No-Copy': "1"};

  // Don't overwrite the object if it's already there!
  return dstService.headObject({
    Bucket: dstBucket,
    Key: key
  }).promise().then(
      _ => {
        throw new Error(`Object ${key} already exists in bucket ${dstBucket}`);
      },
      _ => {
        // No problem - carry on
      }
  ).then(_ => {
    // Get all the attributes of the source object
    return fetch(srcUrl, {
      method: 'HEAD',
      headers: headers
    });
  }).then(srcObjectInfo => {
    console.log(`Copying ${srcUrl} to ${dstBucket}`);

    const writeStream = new stream.PassThrough();

    const metadataHeaders = Object.fromEntries(
        Array.from(srcObjectInfo.headers.entries()).filter(([key]) => key.startsWith('x-amz-meta-'))
    );

    const promise = dstService.upload({
      Bucket: dstBucket,
      Key: key,
      Body: writeStream,
      ChecksumAlgorithm: 'SHA1',
      CacheControl: srcObjectInfo.headers.get('cache-control'),
      ContentDisposition: srcObjectInfo.headers.get('content-disposition'),
      ContentEncoding: srcObjectInfo.headers.get('content-encoding'),
      ContentLanguage: srcObjectInfo.headers.get('content-language'),
      ContentLength: srcObjectInfo.headers.get('content-length'),
      ContentType: srcObjectInfo.headers.get('content-type'),
      Expires: srcObjectInfo.headers.get('expires'),
      Metadata: metadataHeaders,
      // Note - object lock headers are only returned if the requester has s3:GetObjectRetention permission
      ObjectLockMode: srcObjectInfo.headers.get('x-amz-object-lock-mode'),
      ObjectLockRetainUntilDate: srcObjectInfo.headers.get('x-amz-object-lock-retain-until-date'),
      ObjectLockLegalHoldStatus: srcObjectInfo.headers.get('x-amz-object-lock-legal-hold')
    }, {
      queueSize: parseInt(process.env.QUEUE_SIZE),
      partSize: parseInt(process.env.PART_SIZE)
    }).on('httpUploadProgress', function (progress) {
      console.log(key, `${progress.loaded}/${srcObjectInfo.headers.get('content-length')} bytes copied`);
    }).promise();

    fetch(srcUrl, {
      headers: headers
    }).then(response => {
      console.log(`Cache ${response.headers.get('X-Cache')}`);
      response.body.pipe(writeStream)
    });

    return promise;
  });
}

function deleteFile(key, service, bucket) {
  console.log(`Deleting ${key} from ${bucket}`);

  return service.deleteObject({
    Bucket: bucket,
    Key: key
  }).promise();
}

(async() => {
  if (process.env.NODE_ENV.trim() !== "production") {
    dotenv.config()
  }

  checkEnvVars(ENV_VARS);

  const srcService = new S3({
    endpoint: new Endpoint('https://' + process.env.SRC_ENDPOINT),
    secretAccessKey: process.env.SRC_SECRET_KEY,
    accessKeyId: process.env.SRC_ACCESS_KEY
  });

  const dstService = new S3({
    endpoint: new Endpoint('https://' + process.env.DST_ENDPOINT),
    secretAccessKey: process.env.DST_SECRET_KEY,
    accessKeyId: process.env.DST_ACCESS_KEY
  });

  let rawdata = fs.readFileSync('./request.json').toString();
  console.log(`Request: ${rawdata}`);
  let request = JSON.parse(rawdata);

  let response;
  try {
    await copyFile(request['key'], process.env.CACHE_DOMAIN, dstService, process.env.DST_BUCKET_NAME);

    await deleteFile(request['key'], srcService, process.env.SRC_BUCKET_NAME);

    response = {
      "success": true,
      message: `${request['key']} moved successfully`
    };
  } catch (err) {
    response = {
      "success": false,
      message: err.toString()
    };
  }

  const data = JSON.stringify(response, null, 2);
  console.log(`Response: ${data}`);
  fs.writeFileSync('./response.json', data);

  console.log("Task complete.")
})();
