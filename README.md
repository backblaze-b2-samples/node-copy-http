# Copy/Move Data between S3-Compatible Cloud Object Storage Platforms

This app, demonstrated at Backblaze Tech Day 2022, copies a file from one cloud object store to another, then deletes the original object. Use it in conjunction with the accompaying [Fastly Compute@Edge app](https://github.com/backblaze-b2-samples/fastly-on-demand-migration) to migrate data from one endpoint to another as it is requested by CDN clients.

The app is implemented as a [RisingCloud task](https://risingcloud.com/docs/definitions#:~:text=Rising%20Cloud%20Tasks), but could easily be ported to other environments.

Watch the solution in action:

[![Backblaze Tech Day 2022: Go Serverless with Fastly Compute@Edge
](https://user-images.githubusercontent.com/723517/199118944-9b9ad50d-6490-4642-acef-f9e03391a505.png)](https://www.youtube.com/watch?v=ExOUR6wXr8k "Backblaze Tech Day 2022: Go Serverless with Fastly Compute@Edge")

## Prerequisites

Before deploying this app, you will need:

* A Backblaze account - if you do not have one, [sign up here](https://www.backblaze.com/b2/sign-up.html?referrer=nopref). You'll be able to access 10 GB of cloud data storage free of charge, no credit card required.
* A Backblaze bucket - this will be the destination
* A Backblaze application key

* A RisingCloud account - if you do not have one, go to [RisingCloud](https://risingcloud.com/) and click **Get Started**.

* Credentials to access the source object store

## Deploying the App

Clone this repository from GitHub:

```
git clone git@github.com:backblaze-b2-samples/node-copy-http.git
```

Initialize a RisingCloud task with a unique name:

```
risingcloud init -s $YOUR_TASK_NAME
```

`risingcloud init` creates a `risingcloud.yaml` file. Edit the file and replace the following entries, substituting your bucket names, keys etc, in place of the placeholders.

```yaml
from: ubuntu:22.04
deps:
  - curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.sh
  - bash nodesource_setup.sh
  - apt-get install -y nodejs
  - bash -c "(cd node-risingcloud/task; npm install)"
run: node app.js
timeout: 300000
env:
  CACHE_DOMAIN: $YOUR_CACHE_DOMAIN
  SRC_BUCKET_NAME: $SOURCE_BUCKET_NAME
  SRC_ENDPOINT: $SOURCE_API_ENDPOINT
  SRC_ACCESS_KEY: $SOURCE_ACCESS_KEY
  SRC_SECRET_KEY: $SOURCE_SECRET_KEY
  DST_BUCKET_NAME: $DESTINATION_BUCKET_NAME
  DST_ENDPOINT: $DESTINATION_API_ENDPOINT
  DST_ACCESS_KEY: $DESTINATION_ACCESS_KEY
  DST_SECRET_KEY: $DESTINATION_SECRET_KEY
  QUEUE_SIZE: 4
  PART_SIZE: 5242880
  NODE_ENV: production
```

`$YOUR_CACHE_DOMAIN` is your Fastly service's domain, for example, `https://your-task-name.edgecompute.app/` or `https://images.cdn.your-domain.com/`.

By default, RisingCloud will not start any workers until it receives a request. For a more responsive deployment, you can set the minimum number of workers in `risingcloud.yaml` :

```yaml
minWorkers: 1
```

Now push the updated `risingcloud.yaml` to RisingCloud, build and deploy the task:

```
risingcloud push
risingcloud build
risingcloud deploy $YOUR_TASK_NAME
```

## Testing the app

You can use the **Jobs** tab in the RisingCloud web console to test the task by providing a JSON request such as:

```json
{
  "key": "images/myimage.png"
}
```

The task will run, copying the data from `$YOUR_CACHE_DOMAIN/images/myimage.png` to the destination bucket, then deleting the object from the source bucket.

You should see output of the form:

```json
{
  "message": "images/myimage.png moved successfully",
  "success": true
}
```

Now you can deploy the Fastly Compute@Edge app that triggers this RisingCloud task.
