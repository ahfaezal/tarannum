import ast
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException


class AdminLiveScoringTests(unittest.TestCase):
    def setUp(self):
        self.tree=ast.parse(Path(__file__).with_name('platform_endpoints.py').read_text(encoding='utf-8'))

    def test_every_admin_route_requires_admin_dependency(self):
        names=['admin_live_scoring_context','admin_create_training_challenge',
            'admin_list_training_challenges','admin_update_training_challenge','admin_training_challenge_leaderboard']
        for name in names:
            fn=next(n for n in self.tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
            self.assertIn('Depends(get_current_admin_user)',ast.unparse(fn))

    def create(self, admin=False, active=True):
        fn=next(n for n in self.tree.body if isinstance(n,ast.FunctionDef) and n.name=='_create_training_challenge')
        student=uuid4(); qari=uuid4()
        payload=SimpleNamespace(title=' Azan ',reference_id='reference',student_ids=[str(student),str(student)],
            start_at=datetime.now(timezone.utc),end_at=datetime.now(timezone.utc)+timedelta(hours=1))
        db=MagicMock()
        library=MagicMock(); library.filter.return_value.first.return_value=object()
        assignments=MagicMock(); assignments.filter.return_value.all.return_value=[]
        users=MagicMock(); users.filter.return_value.all.return_value=[(student,)] if active else []
        db.query.side_effect=[library,assignments,users]
        models={name:MagicMock() for name in ['QariContent','StudentQariRelationship','User','TrainingChallenge','TrainingChallengeParticipant']}
        env=dict(models,UUID=UUID,timezone=timezone,HTTPException=HTTPException,
            _challenge_payload=lambda challenge,count:{'count':count})
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'<create>','exec'),env)
        result=env['_create_training_challenge'](payload,SimpleNamespace(id=qari),db,admin_managed=admin)
        models['TrainingChallenge'].assert_called_once()
        self.assertEqual(models['TrainingChallenge'].call_args.kwargs['qari_id'],qari)
        self.assertEqual(result['count'],1)
        db.commit.assert_called_once()

    def test_admin_can_select_active_unassigned_student_with_qari_ownership(self):
        self.create(admin=True)

    def test_qari_cannot_select_unassigned_student(self):
        with self.assertRaises(HTTPException) as exc:self.create()
        self.assertEqual(exc.exception.status_code,403)

    def test_admin_cannot_select_inactive_or_nonstudent(self):
        with self.assertRaises(HTTPException) as exc:self.create(admin=True,active=False)
        self.assertEqual(exc.exception.status_code,403)


if __name__=='__main__':unittest.main()
