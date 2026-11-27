import { MockInterview } from "../../features/mock-interview/MockInterview";
import { renderPublicDemoPerRequest } from "../../infrastructure/config/public-demo-rendering";

export const metadata = { title: "Three-question mock interview | Echo Coach" };

export default async function MockInterviewPage() {
  await renderPublicDemoPerRequest();
  return <MockInterview />;
}
