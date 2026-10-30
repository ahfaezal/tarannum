import React from "react";
import { Navigate, useParams } from "react-router-dom";
import ProgramDetailTemplate from "../../components/ProgramDetailTemplate";
import { programBySlug } from "../../data/programs";

const ProgramDetailPage: React.FC = () => {
  const { slug } = useParams();
  const program = programBySlug(slug);
  return program ? <ProgramDetailTemplate program={program}/> : <Navigate to="/program" replace/>;
};

export default ProgramDetailPage;
