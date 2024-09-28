// API Gateway Lambda proxy to clear the accessToken cookie.

import { APIGatewayEvent, Handler } from 'aws-lambda';

export const handler: Handler = async (_event: APIGatewayEvent, _context) => {
  return {
    statusCode: 200,
    cookies: [
      'accessToken=""; Path=/',
      'refreshToken=""; Path=/',
      'accessExpiry=0; Path=/',
    ],
    body: "",
  };
}
