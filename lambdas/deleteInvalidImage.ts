import { SQSHandler } from "aws-lambda"; // 引入 Lambda 的 SQS 事件处理器类型
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3"; // 引入 S3 删除命令和客户端

const s3 = new S3Client({}); // 创建 S3 客户端实例

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body); // 解析 SQS 消息体
    const s3Info = body.Records?.[0]?.s3; // 获取嵌套的 S3 信息

    if (!s3Info) {
      console.log("Invalid S3 info");
      continue;
    }

    const bucket = s3Info.bucket.name;
    const key = decodeURIComponent(s3Info.object.key.replace(/\+/g, " ")); // 解码文件名

    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); // 执行删除操作
      console.log(`Deleted invalid image: ${key}`); // 打印成功日志
    } catch (err) {
      console.error(`Failed to delete image: ${key}`, err); // 打印失败日志
    }
  }
};
