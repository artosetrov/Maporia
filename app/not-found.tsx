import ErrorPage from "./components/ErrorPage";

/**
 * Next.js 404 Not Found page
 * Beautiful error page in Maporia branding style
 */
export default function NotFound() {
  return (
    <ErrorPage
      statusCode={404}
      title="Page not found"
      message="The page you're looking for doesn't exist or has been moved."
    />
  );
}
