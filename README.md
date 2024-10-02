# Admissible Email Passwordless

This package provides an AWS CDK construct and supporting Lambda functions
for deploying a Cognito user pool with a custom authorization flow,
configured for signing in with a one-time-password sent via Simple Email Service.
Three of the Lambdas are triggered by Cognito directly,
for define/create/verify in its auth flow.
The rest of the Lambdas serve as an authorization API,
and may be added as routes on your API Gateway.

## Demo

A demo of this package can be found at
[https://github.com/joagr/admissible-demo](https://github.com/joagr/admissible-demo).
The demo comes with a small React web app and a CDK deployment stack.
The deployment stack includes an AdmissibleEmailPasswordless construct,
along with an API Gateway with the Admissible authorization API routes,
and a protected "hello" Lambda.
A CloudFront distribution surfaces the S3 web app together with the API Gateway.


## Scope

This package and its demo **only** provide sign-in, authentication, and sign-out.
Sign-up is outside the scope.


## Disclaimer

REVIEW THE CODE BEFORE USING.
This is currently (October 2024) at the "hobby project" stage (not battle tested).
It has not been used for any production environments that I am aware of.


## Usage

### Simple Email Service

'Admissible' requires but does **not** set up SES. You must do that beforehand.
You must also test that your SES configuration is working with the From and To email addresses you intend to use.

### Install and Import

```npm install admissible-email-passwordless```

Assuming CDK with TypeScript:
```typescript
import {
  AdmissibleEmailPasswordless,
  AdmissibleConfig
} from 'admissible-email-passwordless';
```

### Configuring

The constructor for `AdmissibleEmailPasswordless` requires an `AdmissibleConfig` object.
Be sure to review the doc-comments for the properties in `AdmissibleConfig`:
[lib/index.ts](https://github.com/joagr/admissible-email-passwordless/blob/main/lib/index.ts)
The default values will **NOT** all work for you.


## Example

The [admissible-demo](https://github.com/joagr/admissible-demo) project provides example usage.


## Resources

* https://github.com/awslabs/aws-jwt-verify
* https://github.com/aws-samples/amazon-cognito-passwordless-email-auth/tree/master/cognito
* https://github.com/aws-samples/amazon-cognito-passwordless-auth
