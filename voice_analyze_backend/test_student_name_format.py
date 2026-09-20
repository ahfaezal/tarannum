import unittest

from database import User


class StudentNameFormatTests(unittest.TestCase):
    def test_user_name_is_uppercase_on_assignment(self):
        user = User(role="student", full_name="  Mohamad   Nor bin Abdul  ")
        self.assertEqual(user.full_name, "MOHAMAD NOR BIN ABDUL")
        user.full_name = "  Nurul  Aminah "
        self.assertEqual(user.full_name, "NURUL AMINAH")

    def test_empty_name_remains_missing(self):
        self.assertIsNone(User(role="student", full_name="  ").full_name)


if __name__ == "__main__":
    unittest.main()
