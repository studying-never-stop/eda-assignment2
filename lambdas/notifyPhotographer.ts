import { SNSHandler } from "aws-lambda";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

// 创建 SES 客户端
const ses = new SESClient({ region: process.env.AWS_REGION });

// 从环境变量中读取发件人和收件人邮箱
const FROM = process.env.FROM_EMAIL!;
const TO = process.env.TO_EMAIL!;

export const handler: SNSHandler = async (event) => {
  console.log("Received status update:", JSON.stringify(event));

  for (const record of event.Records) {
    // 解析 SNS 消息内容
    const { id, status, reason } = JSON.parse(record.Sns.Message);

    // 构造邮件主题和 HTML 内容
    const subject = `Review Result: ${status}`;
    const htmlBody = `
      <h2>Your image has been reviewed:</h2>
      <p><strong>Image ID:</strong> ${id}</p>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Reason:</strong> ${reason}</p>
    `;

    // 构建 SES 邮件发送参数
    const params: SendEmailCommandInput = {
      Destination: { ToAddresses: [TO] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
        },
      },
      Source: FROM,
    };

    try {
      // 发送邮件
      await ses.send(new SendEmailCommand(params));
      console.log(`Email sent to photographer regarding image: ${id}`);
    } catch (err) {
      console.error("Failed to send email", err);
    }
  }
};
