import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';
import {Duration} from "aws-cdk-lib";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {UserPool, UserPoolClient} from "aws-cdk-lib/aws-cognito";



/** Configuration class for the AdmissibleEmailPassword Construct.
 * The default values won't be right for you.
 */
export class AdmissibleConfig {
  /** AWS region for SES.
   * For example, I have SES set up in a different region than my default.
   * Default "us-east-2" is likely not right for you.
   * */
  sesRegion = "us-east-2";
  /** "From" email address when sending one-time-password.
   * Required. Default "example@example.com" won't work.
   * */
  otpFrom = "example@example.com";
  /** Subject line when sending one-time-password email.
   * Default: "Temporary password"
   * */
  otpEmailSubject = "Temporary password";
  /** Text for the body of the email with the one-time-password.
   * There is an empty line between this text and the OTP.
   * Default: "This is your temporary password. It will expire in 15 minutes."
   * */
  otpEmailText = "This is your temporary password. It will expire in 15 minutes."
  /** Name used for the Cognito User Pool.
   * Default: "AdmissibleEmailPasswordless"
   * */
  namingString = "AdmissibleEmailPasswordless";
  /** User Pool Client configuration for accessTokenValidity (Duration).
   * From the CDK docs:
   * Values between 5 minutes and 1 day are valid.
   * The duration can not be longer than the refresh token validity.
   * Default: Duration.minutes(60)
   */
  accessTokenDuration = Duration.minutes(60);
  /** User Pool Client configuration for refreshTokenValidity (Duration).
   * Note that users will have to sign in again whenever this expires.
   * From the CDK docs:
   * Values between 60 minutes and 10 years are valid.
   * Default: Duration.days(30)
   */
  refreshTokenDuration = Duration.days(30);
}


/** Construct providing Cognito custom authentication flow.
 * Creates a Cognito User Pool with Lambdas for the custom flow (define/create/verify).
 * Also provides authentication API Lambdas which may be added as routes from your API Gateway.
 * An AdmissibleConfig object is required for construction.
 */
export class AdmissibleEmailPasswordless extends Construct {

  userPool: UserPool;
  appClient: UserPoolClient;
  defineAuthChallengeLambda: NodejsFunction;
  createAuthChallengeLambda: NodejsFunction;
  verifyAuthChallengeLambda: NodejsFunction;
  apiAuthorizerLambda: NodejsFunction;
  authStatusLambda: NodejsFunction;
  authInitLambda: NodejsFunction;
  authOtpLambda: NodejsFunction;
  authRefreshLambda: NodejsFunction;
  authSignoutLambda: NodejsFunction;

  constructor(scope: Construct, id: string, config: AdmissibleConfig) {
    super(scope, id);

    const bundlingOptions = {
      // ECMAScript module output format, otherwise  defaults to CJS. (OutputFormat.ESM requires Node.js >= 14)
      format: cdk.aws_lambda_nodejs.OutputFormat.ESM
    };
    

    //// Cognito trigger lambdas

    this.defineAuthChallengeLambda = new nodejs.NodejsFunction(this, 'DefineAuthChallengeLambda', {
      description: "Admissible Email Passwordless: Cognito define auth challenge",
      entry: path.join(__dirname, "../cognito-lambdas/auth-define.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(5),
    });

    this.createAuthChallengeLambda = new nodejs.NodejsFunction(this, 'CreateAuthChallengeLambda', {
      description: "Admissible Email Passwordless: Cognito create auth challenge",
      entry: path.join(__dirname, "../cognito-lambdas/auth-create.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(5),
      environment: {
        SES_REGION: config.sesRegion,
        OTP_FROM: config.otpFrom,
        OTP_SUBJECT: config.otpEmailSubject,
        OTP_TEXT: config.otpEmailText,
      }
    });

    // Grant SES permissions to the createAuthChallengeLambda
    this.createAuthChallengeLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    this.verifyAuthChallengeLambda = new nodejs.NodejsFunction(this, 'VerifyAuthChallengeLambda', {
      description: "Admissible Email Passwordless: Cognito verify auth challenge",
      entry: path.join(__dirname, "../cognito-lambdas/auth-verify.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(5),
    });


    //// User Pool

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: config.namingString,
      signInCaseSensitive: false,
      signInAliases: {
        email: true,
        username: false,
      },
      lambdaTriggers: {
        defineAuthChallenge: this.defineAuthChallengeLambda,
        createAuthChallenge: this.createAuthChallengeLambda,
        verifyAuthChallengeResponse: this.verifyAuthChallengeLambda,
      },
    });

    this.appClient = this.userPool.addClient('UserPoolAppClient', {
      generateSecret: false,
      accessTokenValidity: config.accessTokenDuration,
      refreshTokenValidity: config.refreshTokenDuration,
      authFlows: {
        adminUserPassword: false,
        userPassword: false,
        userSrp: false,
        custom: true,
      },
    });
    

    //// API Lambdas

    this.apiAuthorizerLambda = new nodejs.NodejsFunction(this, 'ApiAuthorizerLambda', {
      description: "Admissible Email Passwordless: API Gateway authorizer",
      entry: path.join(__dirname, "../api-lambdas/authorizer.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
      environment: {
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        COGNITO_CLIENT_ID: this.appClient.userPoolClientId,
      },
    });

    this.authStatusLambda = new nodejs.NodejsFunction(this, 'AuthStatusLambda', {
      description: "Admissible Email Passwordless: Get auth status (get signed-in email)",
      entry: path.join(__dirname, "../api-lambdas/auth-status.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
      environment: {
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        COGNITO_CLIENT_ID: this.appClient.userPoolClientId,
      },
    });

    // Grant Cognito permissions to the authStatusLambda (it fetches the user's email)
    this.authStatusLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [this.userPool.userPoolArn],
    }));

    this.authInitLambda = new nodejs.NodejsFunction(this, 'AuthInitLambda', {
      description: "Admissible Email Passwordless: Submit email to initiate auth",
      entry: path.join(__dirname, "../api-lambdas/auth-init.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(20),
      environment: {
        COGNITO_CLIENT_ID: this.appClient.userPoolClientId,
      },
    });

    this.authOtpLambda = new nodejs.NodejsFunction(this, 'AuthOtpLambda', {
      description: "Admissible Email Passwordless: Submit OTP for auth",
      entry: path.join(__dirname, "../api-lambdas/auth-otp.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
      environment: {
        COGNITO_CLIENT_ID: this.appClient.userPoolClientId,
      },
    });

    this.authRefreshLambda = new nodejs.NodejsFunction(this, 'AuthRefreshLambda', {
      description: "Admissible Email Passwordless: Refresh the access token",
      entry: path.join(__dirname, "../api-lambdas/auth-refresh.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
      environment: {
        COGNITO_CLIENT_ID: this.appClient.userPoolClientId,
      },
    });

    this.authSignoutLambda = new nodejs.NodejsFunction(this, 'AuthSignoutLambda', {
      description: "Admissible Email Passwordless: Sign out (clear accessToken cookie)",
      entry: path.join(__dirname, "../api-lambdas/auth-signout.ts"),
      handler: 'handler',
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(5),
    });

  }
}
