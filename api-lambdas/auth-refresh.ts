// API Gateway Lambda proxy to refresh the accessToken.

import { APIGatewayProxyEventV2, Handler } from 'aws-lambda';
import {
  AuthFlowType,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";


export const handler: Handler = async (event: APIGatewayProxyEventV2, _context) => {
  
  const unauthorized = {
    statusCode: 401,
    body: "Unauthorized",
  };
  
  let refreshToken = '';
  for(const cookie of event.cookies ?? []) {
    refreshToken = cookie
        .split("; ")
        .find((row) => row.startsWith("refreshToken="))
        ?.split("=")[1]
      ?? '';
    if (refreshToken)
      break;
  }
  if (!refreshToken) {
    return unauthorized;
  }

  const cognito = new CognitoIdentityProviderClient({});
  const command = new InitiateAuthCommand({
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });
  try {
    const response = await cognito.send(command);
    const accessToken = response.AuthenticationResult?.AccessToken ?? '';
    if (!accessToken) {
      return unauthorized;
    }
    const expiresIn = response.AuthenticationResult?.ExpiresIn ?? 0;
    const accessExpiry = Date.now() + expiresIn * 1000;
    return {
      statusCode: 200,
      cookies: [
        `accessToken=${accessToken}; Secure; HttpOnly; Path=/`,
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
