// Create the custom challenge: email One-Time-Password. This is the second trigger
// invoked by Cognito when a valid user email address is submitted for sign-in.

import * as crypto from "crypto";
import { CreateAuthChallengeTriggerHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";


export const handler: CreateAuthChallengeTriggerHandler = async event => {

  // This handler is largely copied from:
  //   https://github.com/aws-samples/amazon-cognito-passwordless-email-auth

  if (event.request.challengeName !== "CUSTOM_CHALLENGE") {
    return event;
  }

  let passcode: string;

  if (!event.request.session || !event.request.session.length) {
    passcode = crypto.randomInt(100101, 999999).toString();
    const args = buildEmailInput(event.request.userAttributes.email, passcode);
    const command = new SendEmailCommand(args);
    const sesClient = new SESClient({ region: process.env.SES_REGION });
    await sesClient.send(command);
  } else {
    // There's an existing session. Don't generate new digits but
    // re-use the code from the current session. This allows the user to
    // make a mistake when keying in the code and to then retry, rather
    // than needing to e-mail the user an all new code again.
    const previousChallenge = event.request.session.slice(-1)[0];
    passcode = previousChallenge.challengeMetadata!.match(/CODE-(\d*)/)![1];
  }

  // This is sent back to the client app
  event.response.publicChallengeParameters = { email: event.request.userAttributes.email };

  // Add the secret login code to the private challenge parameters
  // so it can be verified by the "Verify Auth Challenge Response" trigger
  event.response.privateChallengeParameters = { secretLoginCode: passcode };

  // Add the secret login code to the session so it is available
  // in a next invocation of the "Create Auth Challenge" trigger
  event.response.challengeMetadata = `CODE-${passcode}`;

  return event;
};


function buildEmailInput(address: string, passcode: string): SendEmailCommandInput {
  return {
    Destination: {
      ToAddresses: [address]
    },
    Source: process.env.OTP_FROM,
    Message: {
      Subject: {
        Data: process.env.OTP_SUBJECT,
        Charset: "UTF-8",
      },
      Body: {
        Text: {
          Data: process.env.OTP_TEXT + "\n\n" + passcode,
          Charset: "UTF-8",
        },
      },
    },
  };
}
