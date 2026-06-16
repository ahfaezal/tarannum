import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Lock,
  Mail,
  Save,
  Shield,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import {
  changeStudentPassword,
  getStudentProfile,
  removeStudentAvatar,
  StudentProfile,
  updateStudentProfile,
  uploadStudentAvatar,
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

const initialsFor = (profile?: StudentProfile | null) => {
  const source = profile?.full_name || profile?.email || "Student";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";
};

const StudentProfileView: React.FC = () => {
  const dispatch = useDispatch();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    ic_number: "",
    address: "",
    phone_number: "",
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const profileIncomplete = useMemo(
    () => !form.ic_number.trim() || !form.address.trim(),
    [form.ic_number, form.address]
  );

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getStudentProfile();
      setProfile(data);
      setForm({
        full_name: data.full_name || "",
        ic_number: data.ic_number || "",
        address: data.address || "",
        phone_number: data.phone_number || "",
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
      const updated = await updateStudentProfile({
        full_name: form.full_name,
        ic_number: form.ic_number,
        address: form.address,
        phone_number: form.phone_number,
      });
      setProfile(updated);
      setSuccess("Profile updated successfully.");
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
      await uploadStudentAvatar(file);
      const updated = await getStudentProfile();
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
      await removeStudentAvatar();
      const updated = await getStudentProfile();
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
      await changeStudentPassword(passwordForm);
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

  const avatarSrc = avatarPreview || profile?.avatar_url || null;

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
                Student Profile
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                Manage your Tarannum AI profile
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Keep your profile ready for learning, Qari guidance, and future certificate details.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-200">
              <div className="font-semibold text-white">{profile?.assigned_qari?.name || "No Qari assigned"}</div>
              <div className="text-xs text-slate-400">Assigned Qari</div>
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
                    <img src={avatarSrc} alt="Student avatar" className="h-full w-full object-cover" />
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
                {profile?.full_name || "Student"}
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

              <div className="mt-5 space-y-3 text-left">
                {!profile?.avatar_path && (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                    Adding your profile photo helps Qari identify your progress.
                  </div>
                )}
                {profileIncomplete && (
                  <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                    Please complete your IC Number and Address before certificate generation.
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Profile Information</h2>
                  <p className="text-sm text-slate-500">Update personal details used in your learning profile.</p>
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
                  <span className="text-sm font-semibold text-slate-700">IC Number</span>
                  <input
                    value={form.ic_number}
                    onChange={(event) => setForm({ ...form, ic_number: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Identity card number"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Address</span>
                  <textarea
                    value={form.address}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Mailing address"
                  />
                </label>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </form>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
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
                    <dt className="font-semibold text-slate-500">Assigned Qari</dt>
                    <dd className="mt-1 text-slate-900">{profile?.assigned_qari?.name || "Not assigned yet"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Joined Date</dt>
                    <dd className="mt-1 text-slate-900">{formatDate(profile?.created_at)}</dd>
                  </div>
                  {profile?.referral_code && (
                    <div>
                      <dt className="font-semibold text-slate-500">Referral Code</dt>
                      <dd className="mt-1 text-slate-900">{profile.referral_code}</dd>
                    </div>
                  )}
                </dl>
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
      </div>
    </div>
  );
};

export default StudentProfileView;
