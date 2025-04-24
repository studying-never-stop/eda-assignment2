import { SNSHandler, SNSMessage } from "aws-lambda"; // 引入 SNS 事件处理器类型
import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({});

// 获取 DynamoDB 表名（来自环境变量，由 CDK 注入）
const tableName = process.env.TABLE_NAME!;

export const handler: SNSHandler = async (event) => {
  console.log("SNS Event:", JSON.stringify(event));

  for (const record of event.Records) {
    const snsMsg = record.Sns;

    // 提取消息正文
    const { id, value } = JSON.parse(snsMsg.Message);

    // 提取 metadata_type（元数据类型）来自 SNS 消息属性
    const metadataType = snsMsg.MessageAttributes?.metadata_type?.Value;

    if (!id || !value || !metadataType) {
      console.error("message lost");
      continue;
    }

    // 构造更新请求：更新 DynamoDB 表中指定字段
    const updateCommand = new UpdateItemCommand({
      TableName: tableName,
      Key: {
        id: { S: id }, // 使用图片文件名作为主键
      },
      UpdateExpression: `SET #meta = :val`,
      ExpressionAttributeNames: {
        "#meta": metadataType, // 动态字段名（Caption、Date、Name）
      },
      ExpressionAttributeValues: {
        ":val": { S: value },
      },
    });

    try {
      await dynamo.send(updateCommand);
      console.log(`Updated image [${id}] - ${metadataType}: ${value}`);
    } catch (err) {
      console.error("DynamoDB update failed", err);
    }
  }
};
