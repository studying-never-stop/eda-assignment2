## Distributed Systems - Event-Driven Architecture.

__Name:__ Wu Songyu

__Demo__: https://youtu.be/Sqwvs_5n5kY

This repository contains the implementation of a skeleton design for an application that manages a photo gallery, illustrated below. The app uses an event-driven architecture and is deployed on the AWS platform using the CDK framework for infrastructure provisioning.

![](./images/arch.png)

### Code Status.

[Advice: In this section, state the status of your submission for each feature listed below. The status options are: (1) Completed & Tested; (2) Attempted (i.e. partially works); (3) Not Attempted. Option (1) implies the feature performs the required action (e.g. updates the table) __only when appropriate__, as dictated by the relevant filtering policy described in the specification.]

__Feature:__
+ Photographer:

  + Log new Images —  Completed & Tested
    Upload the picture to S3.
    Verify the extension. Only.jpeg /.png is supported.
    Successfully recorded in the DynamoDB table.

  + Metadata updating —  Completed & Tested
    Publish metadata (Caption, Date, Name) via SNS.
    The table is updated only when the Photographer user identity is in line with the metadata_type filtering.

  + Invalid image removal —  Completed & Tested
    Illegal files (such a.txt) are automatically entered into the Dead Letter Queue (DLQ).
    Lambda automatically detects and deletes illegal files.

  + Status Update Mailer —  Completed & Tested
    After the review is approved or rejected, an email will be automatically sent to notify the photographer (using AWS SES).

+ Moderator:

  + Status updating —  Completed & Tested
    The auditor sends the audit message (only the main text) via SNS.
    Update the image status field (Pass or Reject) in the DynamoDB table.
    After the update, it will be published to the new notification SNS Topic, and emails will be sent by the email sending Lambda listening.



### Notes (Optional)

Filtering Policy: The Metadata update uses double filtering (metadata_type + user_type), strictly limiting only the messages that meet the requirements to be processed.

SES Verified Email: Amazon SES was used to send notification emails, and it was verified that the same email was sent and received. If it is necessary to try the mailbox, the FROM_EMAIL and TO_EMAIL should be modified in the eda-app-stack.

Error Handling: When dealing with situations such as illegal format files, lost metadata, and incomplete data review, the system can automatically skip error messages without affecting normal processing.

Security: Lambda functions only have the minimum necessary permissions (such as reading and writing DynamoDB, deleting S3 objects, sending SES emails, etc.).
