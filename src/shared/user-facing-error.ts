/** An error whose message is a sentence written for the person on screen, so it is shown as written. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
