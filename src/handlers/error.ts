import { LazyErrorType } from "../types/enum";

export class LazyError extends Error {
  public type: LazyErrorType;
  public originalError?: any;

  constructor(type: LazyErrorType, message: string, originalError?: any) {
    super(message);
    this.name = "LazyError";
    this.type = type;
    this.originalError = originalError;
  }

  static validation(message: string) {
    return new LazyError(LazyErrorType.VALIDATION, message);
  }

  static timeout(message: string) {
    return new LazyError(LazyErrorType.TIMEOUT, message);
  }

  static abort(message: string) {
    return new LazyError(LazyErrorType.ABORT, message);
  }

  static appwrite(message: string, originalError?: any) {
    return new LazyError(LazyErrorType.APPWRITE, message, originalError);
  }

  static config(message: string, originalError?: any) {
    return new LazyError(LazyErrorType.CONFIG, message, originalError);
  }
}
