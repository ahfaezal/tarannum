/**
 * Email OTP verification component.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { resendOtp, verifyEmail } from "../services/authService";

const RESEND_COOLDOWN_SECONDS = 60;

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromQuery = searchParams.get("email") || "";

  const [email] = useState(emailFromQuery);
  const [otpCode, setOtpCode] = useState("");
  const [message, setMessage] = useState("OTP has been sent to your email.");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [verified, setVerified] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage("");

    if (!normalizedEmail) {
      setError("Email is required for verification.");
      return;
    }

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError("Invalid OTP.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await verifyEmail(normalizedEmail, otpCode.trim());
      setVerified(true);
      setMessage(response.message || "Email verified successfully.");
    } catch (err: any) {
      setError(err.message || "Invalid OTP.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setMessage("");

    if (!normalizedEmail) {
      setError("Email is required for verification.");
      return;
    }

    if (cooldown > 0) {
      setError("You may request a new OTP after 60 seconds.");
      return;
    }

    setIsResending(true);
    try {
      const response = await resendOtp(normalizedEmail);
      setMessage(response.message || "OTP has been sent to your email.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err.message || "Failed to resend OTP.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Verify Your Email</h1>
          <p className="text-gray-600 text-sm">
            Enter the 6-digit code sent to:
          </p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            <Mail className="w-4 h-4" />
            <span>{normalizedEmail || "No email provided"}</span>
          </div>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">{message}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!verified ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OTP Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-xl tracking-[0.35em] font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Verify
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
              className="w-full border border-slate-300 text-slate-700 py-2.5 px-4 rounded-lg font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isResending ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                </>
              )}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Continue to Login
          </button>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
