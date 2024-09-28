// API Gateway Lambda proxy to forward an input One-Time-Password to Cognito
// and, if authenticated, set the JWT token on an HttpOnly cookie.

import { APIGatewayEvent, Handler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  RespondToAuthChallengeCommand,
  RespondToAuthChallengeCommandInput
} from "@aws-sdk/client-cognito-identity-provider";


export const handler: Handler = async (event: APIGatewayEvent, _context) => {

  const body = JSON.parse(event.body ?? '{}');
  
  if (!body || !body.email || !body.otp || !body.session) {
    return {
      statusCode: 400,
      body: "Bad Request",
    };
  }
  
  const cognito = new CognitoIdentityProviderClient({});
  const input: RespondToAuthChallengeCommandInput = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    ChallengeName: 'CUSTOM_CHALLENGE',
    Session: body.session,
    ChallengeResponses: {
      USERNAME: body.email,
      ANSWER: body.otp,
    },
  };
  const command = new RespondToAuthChallengeCommand(input);
  try {
    const response = await cognito.send(command);
    const accessToken = response.AuthenticationResult?.AccessToken ?? '';
    const refreshToken = response.AuthenticationResult?.RefreshToken ?? '';
    const expiresIn = response.AuthenticationResult?.ExpiresIn ?? 0;
    const accessExpiry = Date.now() + expiresIn * 1000;
    
    // Put the tokens and expiry into cookies.
    // We are using HttpOnly cookies to protect the tokens from XSS attacks.
    // The accessExpiry is necessarily visible to the client javascript.
    return {
      statusCode: 200,
      cookies: [
        `accessToken=${accessToken}; Secure; HttpOnly; Path=/`,
        `refreshToken=${refreshToken}; Secure; HttpOnly; Path=/`,
        `accessExpiry=${accessExpiry}; Path=/`,
      ],
      body: "",
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: "Request failed",
    };
  }

}
