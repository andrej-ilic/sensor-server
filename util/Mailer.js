const nodemailer = require("nodemailer");

const nodemailerConfigPath = process.env.NODEMAILER_CONFIG_PATH;
const nodemailerConfig = require(`${nodemailerConfigPath}`);

class Mailer {
  constructor() {
    this.transporter = nodemailer.createTransport(nodemailerConfig);
  }

  sendEmail({ to, subject, text }) {
    const message = {
      from: "unic-monitoring@no-reply.com",
      to,
      subject,
      text,
    };

    return this.transporter.sendMail(message);
  }
}

module.exports = new Mailer();
