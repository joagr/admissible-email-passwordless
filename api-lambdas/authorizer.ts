// Custom authorizer for API Gateway, to verify the JWT in an HttpOnly cookie.

import { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { CognitoJwtVerifier } from "aws-jwt-verify";


// Create the verifier outside the Lambda handler (= during cold start),
// so the cache can be reused for subsequent invocations. Then, only during the
// first invocation, will the verifier actually need to fetch the JWKS.
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  tokenUse: null,  // We're not checking this claim
});


/**
 * Lambda handler for the custom authorizer.
 * We are using a Lambda Authorizer because API Gateway's built-in JWT authorizer does not
 * currently support cookies for its token identity-source. We wanted the JWT on an HttpOnly
 * cookie to protect it from XSS.
 * Our sign-in API, which validated the OTP, put the JWT on a cookie named "accessToken".
 * There's a lot to the aws-jwt-verify library. Be sure to see its excellent documentation:
 *   https://github.com/awslabs/aws-jwt-verify
 */
export const handler = async (event: APIGatewayRequestAuthorizerEventV2) => {
  if (!event.cookies) {
    return {
      isAuthorized: false,
      context: {},
    }
  }
  let accessToken = '';
  for(const cookie of event.cookies) {
    accessToken = cookie
      .split("; ")
      .find((row) => row.startsWith("accessToken="))
      ?.split("=")[1]
      ?? '';
    if (accessToken)
      break;
  }
  try {
    const payload = await verifier.verify(accessToken);
    // Here you could place additional role-based authorization logic if needed,
    // comparing the event properties to the payload returned by verify().
    return {
      isAuthorized: true,
      context: {
        // The payload contains the unique identifier (UUID), or subject,
        // for the authenticated user. We'll pass this in the context,
        // so the downstream Lambda can use it, ie:
        //   event.requestContext.authorizer?.lambda?.sub
        sub: payload.sub,
      },
    }
  } catch {
    return {
      isAuthorized: false,
      context: {},
    }
  }
}
