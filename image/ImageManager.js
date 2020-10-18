const fs = require("fs");
const fetch = require("node-fetch");
const CronJob = require("cron").CronJob;
const { admin, db } = require("../firebase");
const log = require("../util/Logger");

class ImageManager {
  constructor(url, fileName) {
    this.url = url;
    this.fileName = fileName;
  }

  start() {
    if (this.job) {
      this.job.stop();
    }

    this.job = new CronJob("0 * * * * *", async () => {
      try {
        await this._downloadImage();
        await this._uploadImageToFirebase();
        log.info("Updated image");
      } catch {
        log.error("Failed to update image");
      }
    });

    this.job.start();
  }

  async _downloadImage() {
    const res = await fetch(this.url);
    const buffer = await res.buffer();
    fs.writeFileSync(`./${this.fileName}`, buffer);
  }

  async _uploadImageToFirebase() {
    await admin.storage().bucket().upload(`./${this.fileName}`);
  }
}

module.exports = ImageManager;
