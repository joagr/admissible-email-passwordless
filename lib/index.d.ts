import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
/** Configuration class for the AdmissibleEmailPassword Construct.
 * The default values won't be right for you.
 */
export declare class AdmissibleConfig {
    /** AWS region for SES.
     * For example, I have SES set up in a different region than my default.
     * Default "us-east-2" is likely not right for you.
     * */
    sesRegion: string;
    /** "From" email address when sending one-time-password.
     * Required. Default "example@example.com" won't work.
     * */
    otpFrom: string;
    /** Subject line when sending one-time-password email.
     * Default: "Temporary password"
     * */
    otpEmailSubject: string;
    /** Text for the body of the email with the one-time-password.
     * There is an empty line between this text and the OTP.
     * Default: "This is your temporary password. It will expire in 15 minutes."
     * */
    otpEmailText: string;
    /** Name used for the Cognito User Pool.
     * Default: "AdmissibleEmailPasswordless"
     * */
    namingString: string;
    /** User Pool Client configuration for accessTokenValidity (Duration).
     * From the CDK docs:
     * Values between 5 minutes and 1 day are valid.
     * The duration can not be longer than the refresh token validity.
     * Default: Duration.minutes(60)
     */
    accessTokenDuration: cdk.Duration;
    /** User Pool Client configuration for refreshTokenValidity (Duration).
     * Note that users will have to sign in again whenever this expires.
     * From the CDK docs:
     * Values between 60 minutes and 10 years are valid.
     * Default: Duration.days(30)
     */
    refreshTokenDuration: cdk.Duration;
}
/** Construct providing Cognito custom authentication flow.
 * Creates a Cognito User Pool with Lambdas for the custom flow (define/create/verify).
 * Also provides authentication API Lambdas which may be added as routes from your API Gateway.
 * An AdmissibleConfig object is required for construction.
 */
export declare class AdmissibleEmailPasswordless extends Construct {
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
    constructor(scope: Construct, id: string, config: AdmissibleConfig);
}
