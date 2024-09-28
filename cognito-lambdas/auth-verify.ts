// Verify the One-Time-Password submitted by the user. This is the third and final
// trigger invoked by Cognito in the custom authentication flow.

import { VerifyAuthChallengeResponseTriggerHandler } from "aws-lambda";


export const handler: VerifyAuthChallengeResponseTriggerHandler = async event => {
  const expectedAnswer = event.request.privateChallengeParameters!.secretLoginCode;
  event.response.answerCorrect = event.request.challengeAnswer === expectedAnswer;
  return event;
};
