"""Keep password recovery available for accounts created by an administrator."""
import ast
import logging
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace


class AdminProvisionedPasswordResetTests(unittest.TestCase):
    def request_reset(self, provisioned=False, verified=False, active=True):
        tree = ast.parse(Path(__file__).with_name("auth_endpoints.py").read_text(encoding="utf-8"))
        fn = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "request_password_reset"
        )
        fn.decorator_list = []
        fn.args.defaults = []
        for arg in fn.args.args:
            arg.annotation = None

        user = SimpleNamespace(
            email="participant@example.com",
            is_active=active,
            email_verified=verified,
            admin_provisioned=provisioned,
            password_reset_last_sent_at=None,
            password_reset_expires_at=None,
            password_reset_resend_count=0,
        )
        sent = []
        commits = []
        background = SimpleNamespace(add_task=lambda *args: sent.append(args))
        db = SimpleNamespace(commit=lambda: commits.append(True))
        env = {
            "datetime": datetime,
            "timedelta": timedelta,
            "logger": logging.getLogger(__name__),
            "OTP_RESEND_COOLDOWN_SECONDS": 60,
            "OTP_MAX_RESENDS": 3,
            "_normalize_email": lambda value: value.strip().lower(),
            "get_user_by_email": lambda _db, _email: user,
            "_generate_otp": lambda: "123456",
            "_set_password_reset_otp": lambda target, code, now, resend_count: (
                setattr(target, "password_reset_last_sent_at", now),
                setattr(target, "password_reset_expires_at", now + timedelta(minutes=10)),
                setattr(target, "password_reset_resend_count", resend_count),
            ),
            "_send_verification_email_background": object(),
        }
        exec(compile(ast.Module(body=[fn], type_ignores=[]), "<forgot-password>", "exec"), env)
        response = env["request_password_reset"](
            SimpleNamespace(email=user.email), background, db
        )
        return response, sent, commits

    def test_admin_provisioned_unverified_account_receives_reset_otp(self):
        _, sent, commits = self.request_reset(provisioned=True)
        self.assertEqual(len(sent), 1)
        self.assertEqual(len(commits), 1)

    def test_public_unverified_account_does_not_receive_reset_otp(self):
        _, sent, commits = self.request_reset()
        self.assertEqual(sent, [])
        self.assertEqual(commits, [])

    def test_verified_account_receives_reset_otp(self):
        _, sent, commits = self.request_reset(verified=True)
        self.assertEqual(len(sent), 1)
        self.assertEqual(len(commits), 1)


if __name__ == "__main__":
    unittest.main()
