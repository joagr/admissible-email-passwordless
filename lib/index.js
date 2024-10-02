"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdmissibleEmailPasswordless = exports.AdmissibleConfig = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const nodejs = require("aws-cdk-lib/aws-lambda-nodejs");
const path = require("path");
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/** Configuration class for the AdmissibleEmailPassword Construct.
 * The default values won't be right for you.
 */
class AdmissibleConfig {
    constructor() {
        /** AWS region for SES.
         * For example, I have SES set up in a different region than my default.
         * Default "us-east-2" is likely not right for you.
         * */
        this.sesRegion = "us-east-2";
        /** "From" email address when sending one-time-password.
         * Required. Default "example@example.com" won't work.
         * */
        this.otpFrom = "example@example.com";
        /** Subject line when sending one-time-password email.
         * Default: "Temporary password"
         * */
        this.otpEmailSubject = "Temporary password";
        /** Text for the body of the email with the one-time-password.
         * There is an empty line between this text and the OTP.
         * Default: "This is your temporary password. It will expire in 15 minutes."
         * */
        this.otpEmailText = "This is your temporary password. It will expire in 15 minutes.";
        /** Name used for the Cognito User Pool.
         * Default: "AdmissibleEmailPasswordless"
         * */
        this.namingString = "AdmissibleEmailPasswordless";
        /** User Pool Client configuration for accessTokenValidity (Duration).
         * From the CDK docs:
         * Values between 5 minutes and 1 day are valid.
         * The duration can not be longer than the refresh token validity.
         * Default: Duration.minutes(60)
         */
        this.accessTokenDuration = aws_cdk_lib_1.Duration.minutes(60);
        /** User Pool Client configuration for refreshTokenValidity (Duration).
         * Note that users will have to sign in again whenever this expires.
         * From the CDK docs:
         * Values between 60 minutes and 10 years are valid.
         * Default: Duration.days(30)
         */
        this.refreshTokenDuration = aws_cdk_lib_1.Duration.days(30);
    }
}
exports.AdmissibleConfig = AdmissibleConfig;
/** Construct providing Cognito custom authentication flow.
 * Creates a Cognito User Pool with Lambdas for the custom flow (define/create/verify).
 * Also provides authentication API Lambdas which may be added as routes from your API Gateway.
 * An AdmissibleConfig object is required for construction.
 */
class AdmissibleEmailPasswordless extends constructs_1.Construct {
    constructor(scope, id, config) {
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
exports.AdmissibleEmailPasswordless = AdmissibleEmailPasswordless;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQyx3REFBd0Q7QUFDeEQsNkJBQTZCO0FBQzdCLDJDQUF1QztBQUN2Qyw2Q0FBcUM7QUFNckM7O0dBRUc7QUFDSCxNQUFhLGdCQUFnQjtJQUE3QjtRQUNFOzs7YUFHSztRQUNMLGNBQVMsR0FBRyxXQUFXLENBQUM7UUFDeEI7O2FBRUs7UUFDTCxZQUFPLEdBQUcscUJBQXFCLENBQUM7UUFDaEM7O2FBRUs7UUFDTCxvQkFBZSxHQUFHLG9CQUFvQixDQUFDO1FBQ3ZDOzs7YUFHSztRQUNMLGlCQUFZLEdBQUcsZ0VBQWdFLENBQUE7UUFDL0U7O2FBRUs7UUFDTCxpQkFBWSxHQUFHLDZCQUE2QixDQUFDO1FBQzdDOzs7OztXQUtHO1FBQ0gsd0JBQW1CLEdBQUcsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0M7Ozs7O1dBS0c7UUFDSCx5QkFBb0IsR0FBRyxzQkFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMzQyxDQUFDO0NBQUE7QUFyQ0QsNENBcUNDO0FBR0Q7Ozs7R0FJRztBQUNILE1BQWEsMkJBQTRCLFNBQVEsc0JBQVM7SUFjeEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxNQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sZUFBZSxHQUFHO1lBQ3RCLHlHQUF5RztZQUN6RyxNQUFNLEVBQUUsR0FBRyxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxHQUFHO1NBQy9DLENBQUM7UUFHRiw0QkFBNEI7UUFFNUIsSUFBSSxDQUFDLHlCQUF5QixHQUFHLElBQUksTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDNUYsV0FBVyxF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RTtZQUM1RSxXQUFXLEVBQUUsb0VBQW9FO1lBQ2pGLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxnQ0FBZ0MsQ0FBQztZQUM3RCxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsV0FBVztZQUMzQyxZQUFZLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsTUFBTTtZQUNoRCxRQUFRLEVBQUUsZUFBZTtZQUN6QixPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1NBQ2pDLENBQUMsQ0FBQztJQUVMLENBQUM7Q0FDRjtBQXZMRCxrRUF1TEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBub2RlanMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtEdXJhdGlvbn0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQge05vZGVqc0Z1bmN0aW9ufSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanNcIjtcbmltcG9ydCB7VXNlclBvb2wsIFVzZXJQb29sQ2xpZW50fSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNvZ25pdG9cIjtcblxuXG5cbi8qKiBDb25maWd1cmF0aW9uIGNsYXNzIGZvciB0aGUgQWRtaXNzaWJsZUVtYWlsUGFzc3dvcmQgQ29uc3RydWN0LlxuICogVGhlIGRlZmF1bHQgdmFsdWVzIHdvbid0IGJlIHJpZ2h0IGZvciB5b3UuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZG1pc3NpYmxlQ29uZmlnIHtcbiAgLyoqIEFXUyByZWdpb24gZm9yIFNFUy5cbiAgICogRm9yIGV4YW1wbGUsIEkgaGF2ZSBTRVMgc2V0IHVwIGluIGEgZGlmZmVyZW50IHJlZ2lvbiB0aGFuIG15IGRlZmF1bHQuXG4gICAqIERlZmF1bHQgXCJ1cy1lYXN0LTJcIiBpcyBsaWtlbHkgbm90IHJpZ2h0IGZvciB5b3UuXG4gICAqICovXG4gIHNlc1JlZ2lvbiA9IFwidXMtZWFzdC0yXCI7XG4gIC8qKiBcIkZyb21cIiBlbWFpbCBhZGRyZXNzIHdoZW4gc2VuZGluZyBvbmUtdGltZS1wYXNzd29yZC5cbiAgICogUmVxdWlyZWQuIERlZmF1bHQgXCJleGFtcGxlQGV4YW1wbGUuY29tXCIgd29uJ3Qgd29yay5cbiAgICogKi9cbiAgb3RwRnJvbSA9IFwiZXhhbXBsZUBleGFtcGxlLmNvbVwiO1xuICAvKiogU3ViamVjdCBsaW5lIHdoZW4gc2VuZGluZyBvbmUtdGltZS1wYXNzd29yZCBlbWFpbC5cbiAgICogRGVmYXVsdDogXCJUZW1wb3JhcnkgcGFzc3dvcmRcIlxuICAgKiAqL1xuICBvdHBFbWFpbFN1YmplY3QgPSBcIlRlbXBvcmFyeSBwYXNzd29yZFwiO1xuICAvKiogVGV4dCBmb3IgdGhlIGJvZHkgb2YgdGhlIGVtYWlsIHdpdGggdGhlIG9uZS10aW1lLXBhc3N3b3JkLlxuICAgKiBUaGVyZSBpcyBhbiBlbXB0eSBsaW5lIGJldHdlZW4gdGhpcyB0ZXh0IGFuZCB0aGUgT1RQLlxuICAgKiBEZWZhdWx0OiBcIlRoaXMgaXMgeW91ciB0ZW1wb3JhcnkgcGFzc3dvcmQuIEl0IHdpbGwgZXhwaXJlIGluIDE1IG1pbnV0ZXMuXCJcbiAgICogKi9cbiAgb3RwRW1haWxUZXh0ID0gXCJUaGlzIGlzIHlvdXIgdGVtcG9yYXJ5IHBhc3N3b3JkLiBJdCB3aWxsIGV4cGlyZSBpbiAxNSBtaW51dGVzLlwiXG4gIC8qKiBOYW1lIHVzZWQgZm9yIHRoZSBDb2duaXRvIFVzZXIgUG9vbC5cbiAgICogRGVmYXVsdDogXCJBZG1pc3NpYmxlRW1haWxQYXNzd29yZGxlc3NcIlxuICAgKiAqL1xuICBuYW1pbmdTdHJpbmcgPSBcIkFkbWlzc2libGVFbWFpbFBhc3N3b3JkbGVzc1wiO1xuICAvKiogVXNlciBQb29sIENsaWVudCBjb25maWd1cmF0aW9uIGZvciBhY2Nlc3NUb2tlblZhbGlkaXR5IChEdXJhdGlvbikuXG4gICAqIEZyb20gdGhlIENESyBkb2NzOlxuICAgKiBWYWx1ZXMgYmV0d2VlbiA1IG1pbnV0ZXMgYW5kIDEgZGF5IGFyZSB2YWxpZC5cbiAgICogVGhlIGR1cmF0aW9uIGNhbiBub3QgYmUgbG9uZ2VyIHRoYW4gdGhlIHJlZnJlc2ggdG9rZW4gdmFsaWRpdHkuXG4gICAqIERlZmF1bHQ6IER1cmF0aW9uLm1pbnV0ZXMoNjApXG4gICAqL1xuICBhY2Nlc3NUb2tlbkR1cmF0aW9uID0gRHVyYXRpb24ubWludXRlcyg2MCk7XG4gIC8qKiBVc2VyIFBvb2wgQ2xpZW50IGNvbmZpZ3VyYXRpb24gZm9yIHJlZnJlc2hUb2tlblZhbGlkaXR5IChEdXJhdGlvbikuXG4gICAqIE5vdGUgdGhhdCB1c2VycyB3aWxsIGhhdmUgdG8gc2lnbiBpbiBhZ2FpbiB3aGVuZXZlciB0aGlzIGV4cGlyZXMuXG4gICAqIEZyb20gdGhlIENESyBkb2NzOlxuICAgKiBWYWx1ZXMgYmV0d2VlbiA2MCBtaW51dGVzIGFuZCAxMCB5ZWFycyBhcmUgdmFsaWQuXG4gICAqIERlZmF1bHQ6IER1cmF0aW9uLmRheXMoMzApXG4gICAqL1xuICByZWZyZXNoVG9rZW5EdXJhdGlvbiA9IER1cmF0aW9uLmRheXMoMzApO1xufVxuXG5cbi8qKiBDb25zdHJ1Y3QgcHJvdmlkaW5nIENvZ25pdG8gY3VzdG9tIGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gKiBDcmVhdGVzIGEgQ29nbml0byBVc2VyIFBvb2wgd2l0aCBMYW1iZGFzIGZvciB0aGUgY3VzdG9tIGZsb3cgKGRlZmluZS9jcmVhdGUvdmVyaWZ5KS5cbiAqIEFsc28gcHJvdmlkZXMgYXV0aGVudGljYXRpb24gQVBJIExhbWJkYXMgd2hpY2ggbWF5IGJlIGFkZGVkIGFzIHJvdXRlcyBmcm9tIHlvdXIgQVBJIEdhdGV3YXkuXG4gKiBBbiBBZG1pc3NpYmxlQ29uZmlnIG9iamVjdCBpcyByZXF1aXJlZCBmb3IgY29uc3RydWN0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgQWRtaXNzaWJsZUVtYWlsUGFzc3dvcmRsZXNzIGV4dGVuZHMgQ29uc3RydWN0IHtcblxuICB1c2VyUG9vbDogVXNlclBvb2w7XG4gIGFwcENsaWVudDogVXNlclBvb2xDbGllbnQ7XG4gIGRlZmluZUF1dGhDaGFsbGVuZ2VMYW1iZGE6IE5vZGVqc0Z1bmN0aW9uO1xuICBjcmVhdGVBdXRoQ2hhbGxlbmdlTGFtYmRhOiBOb2RlanNGdW5jdGlvbjtcbiAgdmVyaWZ5QXV0aENoYWxsZW5nZUxhbWJkYTogTm9kZWpzRnVuY3Rpb247XG4gIGFwaUF1dGhvcml6ZXJMYW1iZGE6IE5vZGVqc0Z1bmN0aW9uO1xuICBhdXRoU3RhdHVzTGFtYmRhOiBOb2RlanNGdW5jdGlvbjtcbiAgYXV0aEluaXRMYW1iZGE6IE5vZGVqc0Z1bmN0aW9uO1xuICBhdXRoT3RwTGFtYmRhOiBOb2RlanNGdW5jdGlvbjtcbiAgYXV0aFJlZnJlc2hMYW1iZGE6IE5vZGVqc0Z1bmN0aW9uO1xuICBhdXRoU2lnbm91dExhbWJkYTogTm9kZWpzRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgY29uZmlnOiBBZG1pc3NpYmxlQ29uZmlnKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IGJ1bmRsaW5nT3B0aW9ucyA9IHtcbiAgICAgIC8vIEVDTUFTY3JpcHQgbW9kdWxlIG91dHB1dCBmb3JtYXQsIG90aGVyd2lzZSAgZGVmYXVsdHMgdG8gQ0pTLiAoT3V0cHV0Rm9ybWF0LkVTTSByZXF1aXJlcyBOb2RlLmpzID49IDE0KVxuICAgICAgZm9ybWF0OiBjZGsuYXdzX2xhbWJkYV9ub2RlanMuT3V0cHV0Rm9ybWF0LkVTTVxuICAgIH07XG4gICAgXG5cbiAgICAvLy8vIENvZ25pdG8gdHJpZ2dlciBsYW1iZGFzXG5cbiAgICB0aGlzLmRlZmluZUF1dGhDaGFsbGVuZ2VMYW1iZGEgPSBuZXcgbm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdEZWZpbmVBdXRoQ2hhbGxlbmdlTGFtYmRhJywge1xuICAgICAgZGVzY3JpcHRpb246IFwiQWRtaXNzaWJsZSBFbWFpbCBQYXNzd29yZGxlc3M6IENvZ25pdG8gZGVmaW5lIGF1dGggY2hhbGxlbmdlXCIsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9jb2duaXRvLWxhbWJkYXMvYXV0aC1kZWZpbmUudHNcIiksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBjZGsuYXdzX2xhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgYXJjaGl0ZWN0dXJlOiBjZGsuYXdzX2xhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LFxuICAgICAgYnVuZGxpbmc6IGJ1bmRsaW5nT3B0aW9ucyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgIH0pO1xuXG4gICAgdGhpcy5jcmVhdGVBdXRoQ2hhbGxlbmdlTGFtYmRhID0gbmV3IG5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnQ3JlYXRlQXV0aENoYWxsZW5nZUxhbWJkYScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFkbWlzc2libGUgRW1haWwgUGFzc3dvcmRsZXNzOiBDb2duaXRvIGNyZWF0ZSBhdXRoIGNoYWxsZW5nZVwiLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vY29nbml0by1sYW1iZGFzL2F1dGgtY3JlYXRlLnRzXCIpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogY2RrLmF3c19sYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGFyY2hpdGVjdHVyZTogY2RrLmF3c19sYW1iZGEuQXJjaGl0ZWN0dXJlLkFSTV82NCxcbiAgICAgIGJ1bmRsaW5nOiBidW5kbGluZ09wdGlvbnMsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFNFU19SRUdJT046IGNvbmZpZy5zZXNSZWdpb24sXG4gICAgICAgIE9UUF9GUk9NOiBjb25maWcub3RwRnJvbSxcbiAgICAgICAgT1RQX1NVQkpFQ1Q6IGNvbmZpZy5vdHBFbWFpbFN1YmplY3QsXG4gICAgICAgIE9UUF9URVhUOiBjb25maWcub3RwRW1haWxUZXh0LFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgU0VTIHBlcm1pc3Npb25zIHRvIHRoZSBjcmVhdGVBdXRoQ2hhbGxlbmdlTGFtYmRhXG4gICAgdGhpcy5jcmVhdGVBdXRoQ2hhbGxlbmdlTGFtYmRhLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3NlczpTZW5kRW1haWwnLCAnc2VzOlNlbmRSYXdFbWFpbCddLFxuICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICB9KSk7XG5cbiAgICB0aGlzLnZlcmlmeUF1dGhDaGFsbGVuZ2VMYW1iZGEgPSBuZXcgbm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdWZXJpZnlBdXRoQ2hhbGxlbmdlTGFtYmRhJywge1xuICAgICAgZGVzY3JpcHRpb246IFwiQWRtaXNzaWJsZSBFbWFpbCBQYXNzd29yZGxlc3M6IENvZ25pdG8gdmVyaWZ5IGF1dGggY2hhbGxlbmdlXCIsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9jb2duaXRvLWxhbWJkYXMvYXV0aC12ZXJpZnkudHNcIiksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBjZGsuYXdzX2xhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgYXJjaGl0ZWN0dXJlOiBjZGsuYXdzX2xhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LFxuICAgICAgYnVuZGxpbmc6IGJ1bmRsaW5nT3B0aW9ucyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgIH0pO1xuXG5cbiAgICAvLy8vIFVzZXIgUG9vbFxuXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogY29uZmlnLm5hbWluZ1N0cmluZyxcbiAgICAgIHNpZ25JbkNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGxhbWJkYVRyaWdnZXJzOiB7XG4gICAgICAgIGRlZmluZUF1dGhDaGFsbGVuZ2U6IHRoaXMuZGVmaW5lQXV0aENoYWxsZW5nZUxhbWJkYSxcbiAgICAgICAgY3JlYXRlQXV0aENoYWxsZW5nZTogdGhpcy5jcmVhdGVBdXRoQ2hhbGxlbmdlTGFtYmRhLFxuICAgICAgICB2ZXJpZnlBdXRoQ2hhbGxlbmdlUmVzcG9uc2U6IHRoaXMudmVyaWZ5QXV0aENoYWxsZW5nZUxhbWJkYSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFwcENsaWVudCA9IHRoaXMudXNlclBvb2wuYWRkQ2xpZW50KCdVc2VyUG9vbEFwcENsaWVudCcsIHtcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGFjY2Vzc1Rva2VuVmFsaWRpdHk6IGNvbmZpZy5hY2Nlc3NUb2tlbkR1cmF0aW9uLFxuICAgICAgcmVmcmVzaFRva2VuVmFsaWRpdHk6IGNvbmZpZy5yZWZyZXNoVG9rZW5EdXJhdGlvbixcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogZmFsc2UsXG4gICAgICAgIHVzZXJQYXNzd29yZDogZmFsc2UsXG4gICAgICAgIHVzZXJTcnA6IGZhbHNlLFxuICAgICAgICBjdXN0b206IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIFxuXG4gICAgLy8vLyBBUEkgTGFtYmRhc1xuXG4gICAgdGhpcy5hcGlBdXRob3JpemVyTGFtYmRhID0gbmV3IG5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnQXBpQXV0aG9yaXplckxhbWJkYScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFkbWlzc2libGUgRW1haWwgUGFzc3dvcmRsZXNzOiBBUEkgR2F0ZXdheSBhdXRob3JpemVyXCIsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9hcGktbGFtYmRhcy9hdXRob3JpemVyLnRzXCIpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogY2RrLmF3c19sYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGFyY2hpdGVjdHVyZTogY2RrLmF3c19sYW1iZGEuQXJjaGl0ZWN0dXJlLkFSTV82NCxcbiAgICAgIGJ1bmRsaW5nOiBidW5kbGluZ09wdGlvbnMsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBDT0dOSVRPX0NMSUVOVF9JRDogdGhpcy5hcHBDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmF1dGhTdGF0dXNMYW1iZGEgPSBuZXcgbm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdBdXRoU3RhdHVzTGFtYmRhJywge1xuICAgICAgZGVzY3JpcHRpb246IFwiQWRtaXNzaWJsZSBFbWFpbCBQYXNzd29yZGxlc3M6IEdldCBhdXRoIHN0YXR1cyAoZ2V0IHNpZ25lZC1pbiBlbWFpbClcIixcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2FwaS1sYW1iZGFzL2F1dGgtc3RhdHVzLnRzXCIpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogY2RrLmF3c19sYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGFyY2hpdGVjdHVyZTogY2RrLmF3c19sYW1iZGEuQXJjaGl0ZWN0dXJlLkFSTV82NCxcbiAgICAgIGJ1bmRsaW5nOiBidW5kbGluZ09wdGlvbnMsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBDT0dOSVRPX0NMSUVOVF9JRDogdGhpcy5hcHBDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDb2duaXRvIHBlcm1pc3Npb25zIHRvIHRoZSBhdXRoU3RhdHVzTGFtYmRhIChpdCBmZXRjaGVzIHRoZSB1c2VyJ3MgZW1haWwpXG4gICAgdGhpcy5hdXRoU3RhdHVzTGFtYmRhLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2NvZ25pdG8taWRwOkFkbWluR2V0VXNlciddLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy51c2VyUG9vbC51c2VyUG9vbEFybl0sXG4gICAgfSkpO1xuXG4gICAgdGhpcy5hdXRoSW5pdExhbWJkYSA9IG5ldyBub2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0F1dGhJbml0TGFtYmRhJywge1xuICAgICAgZGVzY3JpcHRpb246IFwiQWRtaXNzaWJsZSBFbWFpbCBQYXNzd29yZGxlc3M6IFN1Ym1pdCBlbWFpbCB0byBpbml0aWF0ZSBhdXRoXCIsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9hcGktbGFtYmRhcy9hdXRoLWluaXQudHNcIiksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBjZGsuYXdzX2xhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgYXJjaGl0ZWN0dXJlOiBjZGsuYXdzX2xhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LFxuICAgICAgYnVuZGxpbmc6IGJ1bmRsaW5nT3B0aW9ucyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDIwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiB0aGlzLmFwcENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXV0aE90cExhbWJkYSA9IG5ldyBub2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0F1dGhPdHBMYW1iZGEnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJBZG1pc3NpYmxlIEVtYWlsIFBhc3N3b3JkbGVzczogU3VibWl0IE9UUCBmb3IgYXV0aFwiLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vYXBpLWxhbWJkYXMvYXV0aC1vdHAudHNcIiksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBjZGsuYXdzX2xhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgYXJjaGl0ZWN0dXJlOiBjZGsuYXdzX2xhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LFxuICAgICAgYnVuZGxpbmc6IGJ1bmRsaW5nT3B0aW9ucyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIENPR05JVE9fQ0xJRU5UX0lEOiB0aGlzLmFwcENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXV0aFJlZnJlc2hMYW1iZGEgPSBuZXcgbm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdBdXRoUmVmcmVzaExhbWJkYScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFkbWlzc2libGUgRW1haWwgUGFzc3dvcmRsZXNzOiBSZWZyZXNoIHRoZSBhY2Nlc3MgdG9rZW5cIixcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2FwaS1sYW1iZGFzL2F1dGgtcmVmcmVzaC50c1wiKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGNkay5hd3NfbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBhcmNoaXRlY3R1cmU6IGNkay5hd3NfbGFtYmRhLkFyY2hpdGVjdHVyZS5BUk1fNjQsXG4gICAgICBidW5kbGluZzogYnVuZGxpbmdPcHRpb25zLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQ09HTklUT19DTElFTlRfSUQ6IHRoaXMuYXBwQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hdXRoU2lnbm91dExhbWJkYSA9IG5ldyBub2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0F1dGhTaWdub3V0TGFtYmRhJywge1xuICAgICAgZGVzY3JpcHRpb246IFwiQWRtaXNzaWJsZSBFbWFpbCBQYXNzd29yZGxlc3M6IFNpZ24gb3V0IChjbGVhciBhY2Nlc3NUb2tlbiBjb29raWUpXCIsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9hcGktbGFtYmRhcy9hdXRoLXNpZ25vdXQudHNcIiksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBjZGsuYXdzX2xhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgYXJjaGl0ZWN0dXJlOiBjZGsuYXdzX2xhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LFxuICAgICAgYnVuZGxpbmc6IGJ1bmRsaW5nT3B0aW9ucyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgIH0pO1xuXG4gIH1cbn1cbiJdfQ==