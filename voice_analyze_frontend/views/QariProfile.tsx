import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Copy,
  Lock,
  Mail,
  QrCode,
  Save,
  Shield,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import {
  changeQariPassword,
  getQariProfile,
  QariProfile,
  removeQariAvatar,
  updateQariProfile,
  uploadQariAvatar,
} from "../services/authService";
import { fetchCurrentUser } from "../store/slices/authSlice";

const MAX_AVATAR_SIZE = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

const formatDate = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const initialsFor = (profile?: QariProfile | null) => {
  const source = profile?.full_name || profile?.email || "Qari";
  return (
    source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "QA"
  );
};

const QariProfileView: React.FC = () => {
  const dispatch = useDispatch();
  const [profile, setProfile] = useState<QariProfile | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone_number: "",
    organization: "",
    state: "",
    bio: "",
    maqam_specialization: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const referralLink = profile?.referral_code
    ? `${window.location.origin}/register?ref=${encodeURIComponent(profile.referral_code)}`
    : "";
  const qrImageUrl = referralLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(referralLink)}`
    : "";

  const completionItems = useMemo(
    () => [
      { label: "Add phone number", done: Boolean(form.phone_number.trim()) },
      { label: "Add organization", done: Boolean(form.organization.trim()) },
      { label: "Add bio", done: Boolean(form.bio.trim()) },
      { label: "Add maqam specialization", done: Boolean(form.maqam_specialization.trim()) },
      { label: "Add profile photo", done: Boolean(profile?.avatar_path) },
    ],
    [form.bio, form.maqam_specialization, form.organization, form.phone_number, profile?.avatar_path]
  );

  const incompleteItems = completionItems.filter((item) => !item.done);
  const avatarSrc = avatarPreview || profile?.avatar_url || null;

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getQariProfile();
      setProfile(data);
      setForm({
        full_name: data.full_name || "",
        phone_number: data.phone_number || "",
        organization: data.organization || "",
        state: data.state || "",
        bio: data.bio || "",
        maqam_specialization: data.maqam_specialization || "",
      });
      setAvatarPreview(null);
    } catch (err: any) {
      setError(err.message || "Failed to load profile.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const refreshAuthUser = () => {
    dispatch(fetchCurrentUser() as any);
  };

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateQariProfile(form);
      setProfile(updated);
      setSuccess("Qari profile updated successfully.");
      refreshAuthUser();
    } catch (err: any) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setSuccess(null);

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError("Avatar must be JPG, PNG, or WEBP.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError("Avatar image must be 3MB or smaller.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(previewUrl);
    setIsUploading(true);

    try {
      await uploadQariAvatar(file);
      const updated = await getQariProfile();
      setProfile(updated);
      setSuccess("Profile photo updated successfully.");
      refreshAuthUser();
    } catch (err: any) {
      setAvatarPreview(null);
      setError(err.message || "Failed to upload avatar.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await removeQariAvatar();
      const updated = await getQariProfile();
      setProfile(updated);
      setAvatarPreview(null);
      setSuccess("Profile photo removed.");
      refreshAuthUser();
    } catch (err: any) {
      setError(err.message || "Failed to remove avatar.");
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsChangingPassword(true);
    setError(null);
    setSuccess(null);
    try {
      await changeQariPassword(passwordForm);
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      setSuccess("Password changed successfully.");
    } catch (err: any) {
      setError(err.message || "Failed to change password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const copyReferralLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-5xl">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl shadow-slate-200 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
                Qari Profile
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                Manage your Qari profile
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Complete your professional details so students can identify and trust your guidance.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
                <div className="font-semibold text-white">{profile?.is_approved ? "Approved" : "Pending"}</div>
                <div className="text-xs text-slate-400">Approval Status</div>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
                <div className="font-semibold text-white">{profile?.total_students ?? 0}</div>
                <div className="text-xs text-slate-400">Students</div>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
                <div className="font-semibold text-white">{profile?.referral_code || "Not set"}</div>
                <div className="text-xs text-slate-400">Referral Code</div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-500 to-slate-800 text-4xl font-bold text-white shadow-lg">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Qari avatar" className="h-full w-full object-cover" />
                  ) : (
                    initialsFor(profile)
                  )}
                </div>
                <label className="absolute bottom-2 right-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700">
                  <Camera className="h-5 w-5" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                    disabled={isUploading}
                  />
                </label>
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-900">
                {profile?.full_name || "Qari"}
              </h2>
              <p className="text-sm text-slate-500">{profile?.email}</p>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
                  <Upload className="h-4 w-4" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                    disabled={isUploading}
                  />
                </label>
                {profile?.avatar_path && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                )}
              </div>

              {incompleteItems.length > 0 && (
                <div className="mt-5 w-full rounded-2xl bg-amber-50 p-4 text-left text-sm text-amber-800">
                  <p className="font-semibold">Complete your Qari profile</p>
                  <p className="mt-1">Complete your Qari profile to help students identify and trust your guidance.</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5">
                    {incompleteItems.map((item) => (
                      <li key={item.label}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Professional Information</h2>
                  <p className="text-sm text-slate-500">Update details shown in your Qari coaching profile.</p>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit} className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Full Name</span>
                  <input
                    value={form.full_name}
                    onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Your full name"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Phone Number</span>
                  <input
                    value={form.phone_number}
                    onChange={(event) => setForm({ ...form, phone_number: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Example: 019 250 4000"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Organization</span>
                  <input
                    value={form.organization}
                    onChange={(event) => setForm({ ...form, organization: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="School, mosque, or institution"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">State</span>
                  <input
                    value={form.state}
                    onChange={(event) => setForm({ ...form, state: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Example: Selangor"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Maqam Specialization</span>
                  <input
                    value={form.maqam_specialization}
                    onChange={(event) => setForm({ ...form, maqam_specialization: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Example: Bayati, Hijaz, Soba"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Bio</span>
                  <textarea
                    value={form.bio}
                    onChange={(event) => setForm({ ...form, bio: event.target.value })}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Brief teaching background or coaching focus"
                  />
                </label>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Qari Profile"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Account Information</h2>
                <p className="text-sm text-slate-500">Read-only account details.</p>
              </div>
            </div>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Email</dt>
                <dd className="mt-1 text-slate-900">{profile?.email}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Role</dt>
                <dd className="mt-1 capitalize text-slate-900">{profile?.role}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Approval Status</dt>
                <dd className="mt-1 text-slate-900">{profile?.is_approved ? "Approved" : "Pending approval"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Joined Date</dt>
                <dd className="mt-1 text-slate-900">{formatDate(profile?.created_at)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Content Library</dt>
                <dd className="mt-1 text-slate-900">{profile?.content_library_count ?? 0} references</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Referral Information</h2>
                <p className="text-sm text-slate-500">Share this with your students.</p>
              </div>
            </div>
            {profile?.referral_code ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Referral Code</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{profile.referral_code}</p>
                </div>
                {qrImageUrl && (
                  <img src={qrImageUrl} alt="Qari referral QR" className="h-32 w-32 rounded-2xl border border-slate-200 bg-white p-2" />
                )}
                <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 break-all">
                  {referralLink}
                </div>
                <button
                  type="button"
                  onClick={copyReferralLink}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied" : "Copy Link"}
                </button>
                <p className="text-xs text-slate-500">
                  Students who register through this link will be assigned to you after email verification.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Referral code is not available yet.</p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Change Password</h2>
                <p className="text-sm text-slate-500">Verify your current password before changing it.</p>
              </div>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <input
                type="password"
                value={passwordForm.current_password}
                onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Current password"
                required
              />
              <input
                type="password"
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="New password"
                minLength={8}
                required
              />
              <input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Confirm new password"
                minLength={8}
                required
              />
              <button
                type="submit"
                disabled={isChangingPassword}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                <Shield className="h-4 w-4" />
                {isChangingPassword ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};

export default QariProfileView;
