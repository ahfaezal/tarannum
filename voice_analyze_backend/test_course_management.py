import ast
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4
from fastapi import HTTPException


def load_function(file, name, env):
    tree=ast.parse(Path(__file__).with_name(file).read_text(encoding='utf-8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    fn.decorator_list=[]
    fn.args.defaults=[]
    for arg in fn.args.args: arg.annotation=None
    fn.returns=None
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'<actual-course-function>','exec'),env)
    return env[name]


class CourseManagementTests(unittest.TestCase):
    def test_owner_boundary_and_admin_access(self):
        owner=uuid4(); course=SimpleNamespace(qari_id=owner)
        db=MagicMock(); db.query.return_value.filter.return_value.first.return_value=course
        env={'HTTPException':HTTPException,'Course':MagicMock(),'_course_manager':lambda u:None}
        fn=load_function('certification_endpoints.py','_managed_course',env)
        self.assertIs(fn(db,uuid4(),SimpleNamespace(role='qari',id=owner)),course)
        self.assertIs(fn(db,uuid4(),SimpleNamespace(role='admin',id=uuid4())),course)
        with self.assertRaises(HTTPException): fn(db,uuid4(),SimpleNamespace(role='qari',id=uuid4()))

    def test_students_and_unapproved_qari_cannot_manage_courses(self):
        fn=load_function('certification_endpoints.py','_course_manager',{'HTTPException':HTTPException})
        for user in [SimpleNamespace(role='student',is_active=True),SimpleNamespace(role='qari',is_active=True,is_approved=False)]:
            with self.assertRaises(HTTPException):fn(user)

    def test_course_board_rejects_nonmembers_even_for_admin(self):
        owner=uuid4(); student=uuid4(); now=datetime.utcnow()
        course=SimpleNamespace(qari_id=owner,reference_id='ref',starts_at=now,completion_window_days=30)
        db=MagicMock()
        library=MagicMock(); library.filter.return_value.first.return_value=object()
        assigned=MagicMock(); assigned.filter.return_value.all.return_value=[(student,)]
        courses=MagicMock(); courses.filter.return_value.first.return_value=course
        members=MagicMock(); members.join.return_value.filter.return_value.all.return_value=[]
        db.query.side_effect=[library,assigned,courses,members]
        env={n:MagicMock() for n in ['QariContent','StudentQariRelationship','User','Course','CourseEnrollment','TrainingChallenge','TrainingChallengeParticipant']}
        env.update(HTTPException=HTTPException,UUID=UUID,timezone=timezone,timedelta=timedelta)
        # Preserve this function's real default argument by explicitly supplying all args.
        fn=load_function('platform_endpoints.py','_create_training_challenge',env)
        payload=SimpleNamespace(title='Azan',reference_id='ref',student_ids=[str(student)],course_id=uuid4(),start_at=now,end_at=now+timedelta(hours=1))
        with self.assertRaises(HTTPException):fn(payload,SimpleNamespace(id=owner),db,True)
        db.commit.assert_not_called()

    def test_competency_requires_attendance_and_60_minutes(self):
        student=SimpleNamespace(id=uuid4()); now=datetime.utcnow(); cid=uuid4()
        session=SimpleNamespace(id=uuid4(),reference_id='ref',created_at=now,qari_id=uuid4())
        course=SimpleNamespace(id=cid,starts_at=now-timedelta(hours=1),completion_window_days=30,certificate_category='azan',qari_id=uuid4())
        db=MagicMock()
        queries=[MagicMock() for _ in range(4)]
        queries[0].filter.return_value.first.return_value=session
        queries[1].filter.return_value.first.return_value=SimpleNamespace(score=85)
        queries[2].filter.return_value.order_by.return_value.all.return_value=[course]
        queries[3].filter.return_value.first.return_value=object()
        db.query.side_effect=queries
        env={n:MagicMock() for n in ['UserSession','AnalysisResult','Course','CourseEnrollment']}
        env['Course'].starts_at.__le__.return_value=True
        env.update(_as_uuid=lambda v:UUID(str(v)),grade_for_score=lambda s:'mumtaz',timedelta=timedelta,
            recalculate_enrollment=lambda *args,**kwargs:{'eligible':False})
        fn=load_function('certification_service.py','submit_competency_application',env)
        with self.assertRaisesRegex(ValueError,'60 minutes'):fn(db,student,uuid4(),'competency_azan',cid)


if __name__=='__main__':unittest.main()
