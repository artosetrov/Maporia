export { signUp } from "./signUp";
export type { SignUpResult } from "./signUp";

export { signInWithPassword } from "./signInWithPassword";
export type { SignInResult } from "./signInWithPassword";

export { requestPasswordReset } from "./requestPasswordReset";
export type { ResetRequestResult } from "./requestPasswordReset";

export { updatePassword } from "./updatePassword";
export type { UpdatePasswordResult } from "./updatePassword";

export { resendConfirmation } from "./resendConfirmation";
export type { ResendResult } from "./resendConfirmation";

export { sendMagicLink } from "./sendMagicLink";
export type { MagicLinkResult } from "./sendMagicLink";

export { mapAuthError } from "./errors";
export type { AuthErrorCode, MappedAuthError } from "./errors";
