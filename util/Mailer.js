const nodemailer = require("nodemailer");
const nodemailerSendgrid = require("nodemailer-sendgrid");

class Mailer {
  constructor() {
    this.transporter = nodemailer.createTransport(
      nodemailerSendgrid({
        apiKey: process.env.SG_API_KEY,
      })
    );
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
