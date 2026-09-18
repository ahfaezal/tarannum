"""Exercise the actual login function without initializing production services."""
import ast
import logging
import unittest
from pathlib import Path
from types import SimpleNamespace
from datetime import timedelta
from fastapi import HTTPException, status


class AdminProvisionedLoginTests(unittest.TestCase):
    def login(self, provisioned=False, verified=False, approved=True, active=True, password='correct'):
        tree = ast.parse(Path(__file__).with_name('auth_endpoints.py').read_text(encoding='utf-8'))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'login')
        fn.decorator_list = []
        fn.args.defaults = []
        for arg in fn.args.args:
            arg.annotation = None
        user = SimpleNamespace(id='stable-id', email='participant@example.com', role='student',
            full_name='Participant', hashed_password='hash', admin_provisioned=provisioned,
            email_verified=verified, is_approved=approved, is_active=active)
        env = dict(HTTPException=HTTPException, status=status, timedelta=timedelta,
            logger=logging.getLogger(__name__), ACCESS_TOKEN_EXPIRE_MINUTES=60,
            UserRole=SimpleNamespace(ADMIN=SimpleNamespace(value='admin'),
                STUDENT=SimpleNamespace(value='student'), QARI=SimpleNamespace(value='qari')),
            _normalize_email=lambda s:s.strip().lower(), _role_value=lambda r:r,
            get_user_by_email=lambda db,email:user,
            verify_password=lambda password,hashed:password=='correct',
            authenticate_user=lambda *args:user if active else None,
            create_access_token=lambda **kwargs:kwargs['data']['sub'])
        exec(compile(ast.Module(body=[fn], type_ignores=[]), '<login>', 'exec'), env)
        return env['login'](SimpleNamespace(email=user.email,password=password), None)

    def test_admin_created_unverified_can_login(self):
        self.assertEqual(self.login(provisioned=True)['access_token'], 'stable-id')

    def test_public_unverified_still_requires_otp(self):
        with self.assertRaises(HTTPException) as exc: self.login()
        self.assertEqual(exc.exception.status_code,403)

    def test_verified_public_can_login(self):
        self.assertEqual(self.login(verified=True)['user_id'],'stable-id')

    def test_provisioning_does_not_bypass_password_approval_or_active(self):
        for values in [dict(password='wrong'),dict(approved=False),dict(active=False)]:
            with self.subTest(values=values), self.assertRaises(HTTPException):
                self.login(provisioned=True,**values)


if __name__ == '__main__': unittest.main()
