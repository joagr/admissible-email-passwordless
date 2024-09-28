// Initiate custom authentication flow. This is the first trigger invoked by Cognito
// when a valid user email address is submitted for sign-in.

import {
  DefineAuthChallengeTriggerHandler,
} from "aws-lambda";


export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  
  if (!event.request.session.length) {
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = "CUSTOM_CHALLENGE";
    return event;
  }

  const lastSession = event.request.session.at(-1)!;

  if (lastSession.challengeName !== "CUSTOM_CHALLENGE") {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  if (lastSession.challengeResult) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    return event;
  }

  if (event.request.session.length >= 3) {
    // Too many incorrect passcode attempts
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  // The user did not provide a correct answer yet
  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = 'CUSTOM_CHALLENGE';

  return event;
};
