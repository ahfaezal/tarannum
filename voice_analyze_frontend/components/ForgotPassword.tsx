import React, { useState } from "react";
import { ArrowLeft, CheckCircle, KeyRound, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { requestPasswordReset, resetPassword } from "../services/authService";

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "reset" | "complete">("request");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await requestPasswordReset(email.trim());
      setMessage(response.message);
      setStep("reset");
    } catch (err: any) {
      setError(err.message || "Unable to request a reset code.");
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email.trim(), otpCode, newPassword, confirmPassword);
      setStep("complete");
      setMessage("Password reset successfully. You may now sign in.");
    } catch (err: any) {
      setError(err.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-150px)] items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          {step === "complete" ? <CheckCircle /> : <KeyRound />}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          {step === "complete" ? "Password updated" : "Reset your password"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {step === "request"
            ? "Enter your registered email and we will send a six-digit reset code."
            : step === "reset"
              ? "Enter the code from your email and choose a new password."
              : "Your new password is ready to use."}
        </p>

        {message && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}
        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {step === "request" && (
          <form onSubmit={requestCode} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700" htmlFor="recovery-email">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button disabled={loading} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {loading ? "Sending..." : "Send reset code"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={submitReset} className="mt-6 space-y-4">
            <input aria-label="Six-digit reset code" inputMode="numeric" maxLength={6} required value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit reset code" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 tracking-[0.35em]" />
            <input aria-label="New password" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            <input aria-label="Confirm new password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            <p className="text-xs leading-5 text-slate-500">Use at least 8 characters with uppercase, lowercase, number and special character.</p>
            <button disabled={loading || otpCode.length !== 6} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {loading ? "Updating..." : "Reset password"}
            </button>
            <button type="button" onClick={() => { setStep("request"); setMessage(null); setError(null); }} className="w-full text-sm font-medium text-emerald-700">Request another code</button>
          </form>
        )}

        {step === "complete" && (
          <button onClick={() => navigate("/login")} className="mt-6 w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700">Return to sign in</button>
        )}

        {step !== "complete" && <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>}
      </div>
    </div>
  );
};

export default ForgotPassword;
