import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 摄影师功能 1：上传图像处理
    // 创建 S3 Bucket：用于摄影师上传图片（仅限 jpeg/png）
    const imagesBucket = new s3.Bucket(this, "images-bucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // 创建 DLQ：处理非法文件（非 jpeg/png）
    const recordDLQ = new sqs.Queue(this, "record-dlq", {
      retentionPeriod: Duration.days(1),
    });

    // 创建主队列：用于接收图片上传事件（来自 S3 → Lambda）
    const recordQueue = new sqs.Queue(this, "record-queue", {
      visibilityTimeout: Duration.seconds(30),
      deadLetterQueue: {
        queue: recordDLQ,
        maxReceiveCount: 1,
      },
    });

    // 创建 DynamoDB 表：存储图像元数据（文件名为主键）
    const imageTable = new dynamodb.Table(this, "image-table", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 创建记录图像的 Lambda 函数（处理上传成功的 jpeg/png）
    const recordImageFn = new lambdanode.NodejsFunction(this, "recordImageFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/recordImage.ts`,
      timeout: Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: imageTable.tableName,
      },
    });

    // 授权 Lambda 访问 S3、写入 DynamoDB
    imagesBucket.grantRead(recordImageFn);
    imageTable.grantWriteData(recordImageFn);

    // S3 → SQS：配置上传事件触发
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(recordQueue)
    );

    // SQS → Lambda：绑定图像记录处理器
    recordImageFn.addEventSource(
      new SqsEventSource(recordQueue, {
        batchSize: 1,
        maxBatchingWindow: Duration.seconds(5),
      })
    );

    // 创建删除非法文件的 Lambda 函数
    const deleteInvalidFn = new lambdanode.NodejsFunction(this, "deleteInvalidFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/deleteInvalidImage.ts`,
      timeout: Duration.seconds(10),
      memorySize: 128,
    });

    // 允许删除 Lambda 操作桶
    imagesBucket.grantDelete(deleteInvalidFn);

    // DLQ → Lambda：绑定非法文件删除器
    deleteInvalidFn.addEventSource(
      new SqsEventSource(recordDLQ, {
        batchSize: 1,
        maxBatchingWindow: Duration.seconds(5),
      })
    );

    // 摄影师功能 2：元数据更新
    // 创建 SNS Topic：用于发送元数据消息（如 Caption、Date、Name）
    const metadataTopic = new sns.Topic(this, "MetadataTopic", {
      displayName: "Image Metadata Topic",
    });

    // 创建 Lambda 函数：消费元数据 SNS 消息，并更新 DynamoDB 中对应项
    const addMetadataFn = new lambdanode.NodejsFunction(this, "addMetadataFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      entry: `${__dirname}/../lambdas/addMetadata.ts`,
      environment: {
        TABLE_NAME: imageTable.tableName,
      },
    });

    // 授权 Lambda 更新 DynamoDB 表
    imageTable.grantWriteData(addMetadataFn);

    // SNS → Lambda 订阅（过滤策略只允许三种元数据类型，外加只能是摄影师用户类型）
    metadataTopic.addSubscription(
      new subs.LambdaSubscription(addMetadataFn, {
        filterPolicy: {
          metadata_type: sns.SubscriptionFilter.stringFilter({
            allowlist: ["Caption", "Date", "Name"],
          }),
          // 可选加强：
        user_type: sns.SubscriptionFilter.stringFilter({
          allowlist: ["Photographer"],
        }),
        },
      })
    );

    // 输出元数据 SNS 主题的 ARN（用于 CLI 发布消息）
    new cdk.CfnOutput(this, "metadataTopicArn", {
      value: metadataTopic.topicArn,
    });

    // 审核员功能：状态更新 + 邮件通知

    // 创建 SNS Topic：用于审核员提交审核状态
    const statusTopic = new sns.Topic(this, "StatusTopic", {
      displayName: "Review Status Topic",
    });

    // 通知摄影师的 Topic
    const notifyTopic = new sns.Topic(this, "NotifyTopic", {
      displayName: "Notify Photographer Topic",
    });

    // 创建 Lambda 函数：审核员更新状态 → 写入 DynamoDB
    const updateStatusFn = new lambdanode.NodejsFunction(this, "updateStatusFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      entry: `${__dirname}/../lambdas/updateStatus.ts`,
      environment: {
        TABLE_NAME: imageTable.tableName,
        STATUS_NOTIFY_TOPIC_ARN: notifyTopic.topicArn,
      },
    });

    // 授权：允许更新 DynamoDB 表、发布 SNS 通知
    imageTable.grantWriteData(updateStatusFn);
    statusTopic.grantPublish(updateStatusFn);
    notifyTopic.grantPublish(updateStatusFn);

    // 审核员 SNS 消息订阅：触发 updateStatusFn（无属性过滤）
    statusTopic.addSubscription(new subs.LambdaSubscription(updateStatusFn));

    // 创建 Lambda 函数：状态变更 → 发邮件通知摄影师
    const notifyPhotographerFn = new lambdanode.NodejsFunction(this, "notifyPhotographerFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      entry: `${__dirname}/../lambdas/notifyPhotographer.ts`,
      environment: {
        FROM_EMAIL: "SES_EMAIL_FROM",
        TO_EMAIL: "SES_EMAIL_TO",
      },
    });

    // 授权 Lambda 使用 SES 发邮件
    notifyPhotographerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      })
    );

    // 当 updateStatusFn 发布通知 → 触发邮件 Lambda
    notifyTopic.addSubscription(new subs.LambdaSubscription(notifyPhotographerFn));

    // 输出 Topic ARN、Bucket 名称、表名（供 CLI 使用）
    new cdk.CfnOutput(this, "statusTopicArn", {
      value: statusTopic.topicArn,
    });

    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, "tableName", {
      value: imageTable.tableName,
    });
  }
}
