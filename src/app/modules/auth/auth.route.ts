import { Router } from "express";
import { AuthController } from "./auth.controller";
import validateRequest from "../../middlewares/validateRequest";
import { AuthValidation } from "./auth.validation";
import authMiddleware from "../../middlewares/authMiddleware";

const router = Router();

router.post(
  "/register",
  validateRequest(AuthValidation.patientRegistrationSchema),
  AuthController.registerPatient,
);

router.post(
  "/resend-verification-email",
  validateRequest(AuthValidation.resendVerificationEmailSchema),
  AuthController.resendVerificationEmail,
);

router.post(
  "/verify-email",
  validateRequest(AuthValidation.verifyEmailWithOTPSchema),
  AuthController.verifyEmailWithOTP,
);

router.post(
  "/forgot-password",
  validateRequest(AuthValidation.forgotPasswordSchema),
  AuthController.forgotPassword,
);

router.post(
  "/reset-password",
  validateRequest(AuthValidation.resetPasswordSchema),
  AuthController.resetPassword,
);

router.post(
  "/login",
  validateRequest(AuthValidation.loginSchema),
  AuthController.login,
);
router.get("/me", authMiddleware(), AuthController.getMe);

router.post("/refresh-token", AuthController.refreshToken);

router.post(
  "/change-password",
  authMiddleware(),
  validateRequest(AuthValidation.changePasswordSchema),
  AuthController.changePassword,
);
router.post("/logout", AuthController.logout);

router.get("/verification-success", (req, res) => {
  res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f4f4f4;">
          <div style="background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
            <h1 style="color: #28a745;">Email Verified! ✅</h1>
            <p style="color: #555; font-size: 18px;">Your email has been successfully verified.</p>
            <p style="color: #777;">You can now return to the app and login.</p>
          </div>
        </body>
      </html>
    `);
});

router.get("/login/google", AuthController.googleLogin);
router.get("/google/success", AuthController.googleLoginSuccess);
router.get("/oauth/error", AuthController.handleOAuthError);

router.get(
  "/verification-success",
  (req, res) => {
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f4f4f4;">
          <div style="background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
            <h1 style="color: #28a745;">Email Verified! ✅</h1>
            <p style="color: #555; font-size: 18px;">Your email has been successfully verified.</p>
            <p style="color: #777;">You can now return to the app and login.</p>
          </div>
        </body>
      </html>
    `);
  }
);

export const AuthRoutes = router;
