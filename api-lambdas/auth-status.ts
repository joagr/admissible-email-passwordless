// Returns the email address of the authenticated user.

import { APIGatewayEvent, Handler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export const handler: Handler = async (event: APIGatewayEvent, _context) => {

  // Our API Gateway custom authorizer put the user's unique (UUID) "subject" ID
  // in its returned context, and API Gateway forwards it here.
  const sub = event.requestContext.authorizer?.lambda?.sub;
  
  // Now use the "sub" to fetch the user's email address from Cognito.
  try {
    const cognito = new CognitoIdentityProviderClient({});
    const command = new AdminGetUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: sub,
    });
    const response = await cognito.send(command);
    const emailAttribute = response.UserAttributes?.find(attr => attr.Name === 'email');
    const email = emailAttribute?.Value;

    if (email) {
      return {
        statusCode: 200,
        "headers": {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: email
        }),
      };
    } else {
      return {
        statusCode: 404,
        body: "Email not found",
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: "Internal Server Error",
    };
  }

}
