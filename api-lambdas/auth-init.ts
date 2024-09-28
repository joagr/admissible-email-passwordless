// API Gateway Lambda proxy to initialize authentication on Cognito.
// This just acts as a proxy to Cognito's InitiateAuthCommand, so that the
// client-side code doesn't need to be configured with Cognito endpoints.
// Note that this Lambda references process.env.COGNITO_CLIENT_ID, which is
// provided by the CDK deployment construct.

import { APIGatewayEvent, Handler } from 'aws-lambda';
import {
  AuthFlowType,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";


export const handler: Handler = async (event: APIGatewayEvent, _context) => {

  const body = JSON.parse(event.body ?? '{}');
  if (!body || !body.email) {
    return {
      statusCode: 400,
      body: "Bad request",
    };
  }

  const email = body.email;
  const cognito = new CognitoIdentityProviderClient({});
  const command = new InitiateAuthCommand({
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthFlow: AuthFlowType.CUSTOM_AUTH,
    AuthParameters: {
      USERNAME: email,
    },
  });
  try {
    const response = await cognito.send(command);
    if (response.ChallengeName == "CUSTOM_CHALLENGE") {
      return {
        statusCode: 200,
        "headers": {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          session: response.Session,
        }),
      };
    }
  } catch (exception) {}
  return {
    statusCode: 400,
    body: "Request failed",
  };
}
