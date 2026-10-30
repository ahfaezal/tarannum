import React from "react";
import { Navigate, useParams } from "react-router-dom";
import AchievementDetailTemplate from "../../components/AchievementDetailTemplate";
import { achievementBySlug } from "../../data/achievements";

const AchievementDetailPage: React.FC = () => {
  const { slug } = useParams();
  const achievement = achievementBySlug(slug);
  return achievement ? <AchievementDetailTemplate achievement={achievement}/> : <Navigate to="/pencapaian" replace/>;
};

export default AchievementDetailPage;
