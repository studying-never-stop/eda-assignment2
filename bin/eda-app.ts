#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EDAAppStack } from "../lib/eda-app-stack";

const app = new cdk.App();
new EDAAppStack(app, "Assignment2", {
  env: { region: "eu-west-1" },
});
