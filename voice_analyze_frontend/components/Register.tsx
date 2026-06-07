/**
 * Registration component for new users.
 */
import React, { useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { registerUser } from "../store/slices/authSlice";
import { RootState } from "../store";
import { UserPlus, Mail, Lock, User, AlertCircle, Check, X, CheckCircle, Info } from "lucide-react";

interface RegisterProps {
  onSwitchToLogin: () => void;
  onSuccess?: () => void;
  onClose?: () => void; // Optional: for public users to go back to demo (not used with routing)
}

const Register: React.FC<RegisterProps> = ({ onSwitchToLogin, onSuccess, onClose }) => {
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state: RootState) => state.auth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<"student" | "qari">("student");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Password validation rules
  const passwordRules = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasMaxLength = password.length <= 72;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);

    return {
      minLength: hasMinLength,
      maxLength: hasMaxLength,
      uppercase: hasUppercase,
      lowercase: hasLowercase,
      number: hasNumber,
      special: hasSpecial,
    };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    try {
      await dispatch(
        registerUser({
          email,
          password,
          full_name: fullName || undefined,
          ic_number: icNumber || undefined,
          address: address || undefined,
          role: role, // Use selected role (student or qari)
        })
      ).unwrap();
      // Show success message based on role
      if (role === "student") {
        setSuccessMessage("Registered successfully! You can now log in.");
      } else {
        setSuccessMessage("Registered successfully! Please wait for approval from admin before logging in.");
      }
      // Redirect to login after 3 seconds
      setTimeout(() => {
        onSuccess?.();
      }, 3000);
    } catch (err) {
      // Error is handled by Redux state
      setSuccessMessage(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-3 sm:p-4 relative">
      <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 w-full max-w-md max-h-[100dvh] overflow-y-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Tarannum AI</h1>
          <p className="text-gray-600">Create your account</p>
        </div>

        {successMessage && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-emerald-50 border-2 border-blue-300 rounded-lg flex items-start gap-3 text-blue-800 shadow-md animate-fade-in">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-blue-900 mb-1 text-base">Registration Successful!</div>
              <span className="text-sm text-blue-700">{successMessage}</span>
              <div className="mt-2 text-xs text-blue-600">
                Redirecting to login page...
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" style={{ display: successMessage ? 'none' : 'block' }}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Your full name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IC Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={icNumber}
                onChange={(e) => setIcNumber(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Your IC/Identity Card Number"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                rows={3}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                placeholder="Your address"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "student" | "qari")}
                required
                className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="student">Student</option>
                <option value="qari">Qari</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {role === "student" 
                ? "Students can log in immediately after registration."
                : "Qari accounts require admin approval before you can log in."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            
            {/* Password Requirements */}
            <div className="mt-2 space-y-1.5">
              <div className={`flex items-center gap-2 text-xs ${passwordRules.minLength ? 'text-green-600' : 'text-gray-500'}`}>
                {passwordRules.minLength ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>At least 8 characters</span>
              </div>
              <div className={`flex items-center gap-2 text-xs ${passwordRules.maxLength ? 'text-green-600' : password.length > 72 ? 'text-red-600' : 'text-gray-500'}`}>
                {passwordRules.maxLength ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>Maximum 72 characters</span>
              </div>
              <div className={`flex items-center gap-2 text-xs ${passwordRules.uppercase ? 'text-green-600' : 'text-gray-500'}`}>
                {passwordRules.uppercase ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>One uppercase letter (A-Z)</span>
              </div>
              <div className={`flex items-center gap-2 text-xs ${passwordRules.lowercase ? 'text-green-600' : 'text-gray-500'}`}>
                {passwordRules.lowercase ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>One lowercase letter (a-z)</span>
              </div>
              <div className={`flex items-center gap-2 text-xs ${passwordRules.number ? 'text-green-600' : 'text-gray-500'}`}>
                {passwordRules.number ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>One number (0-9)</span>
              </div>
              <div className={`flex items-center gap-2 text-xs ${passwordRules.special ? 'text-green-600' : 'text-gray-500'}`}>
                {passwordRules.special ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>One special character (!@#$%^&*()_+-=[]&#123;&#125;|;:,.{`<>`}?)</span>
              </div>
            </div>
          </div>


          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                Create Account
              </>
            )}
          </button>
        </form>

        {!successMessage && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <button
                onClick={onSwitchToLogin}
                className="text-green-600 hover:text-green-700 font-medium"
              >
                Sign in here
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
