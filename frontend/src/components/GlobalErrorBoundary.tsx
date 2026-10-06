import GitHubIcon from "@mui/icons-material/GitHub";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button, Stack, Typography } from "@mui/material";
import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

const ISSUE_URL = "https://github.com/mitrydoug/Symvolia/issues/new";
const MAX_ERROR_DETAIL_LENGTH = 4000;

type GlobalErrorBoundaryProps = {
  children: ReactNode;
};

type GlobalErrorBoundaryState = {
  hasError: boolean;
  error?: unknown;
  errorInfo?: ErrorInfo;
};

const handleReload = () => {
  window.location.reload();
};

const truncate = (value: string): string =>
  value.length > MAX_ERROR_DETAIL_LENGTH
    ? `${value.slice(0, MAX_ERROR_DETAIL_LENGTH)}\n...truncated`
    : value;

const serializeUnknown = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? "Unserializable value";
  } catch {
    return "Unserializable value";
  }
};

const getErrorSummary = (error: unknown): string => {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`;
  }

  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown frontend error";
};

const formatErrorDetails = (error?: unknown): string => {
  if (!error) {
    return "No error object was captured.";
  }

  if (isRouteErrorResponse(error)) {
    return [
      `Status: ${error.status}`,
      `Status text: ${error.statusText}`,
      `Data: ${serializeUnknown(error.data)}`,
    ].join("\n");
  }

  if (error instanceof Error) {
    return truncate(
      [`Name: ${error.name}`, `Message: ${error.message}`, error.stack]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (typeof error === "string") {
    return error;
  }

  return truncate(serializeUnknown(error));
};

const buildIssueUrl = (error?: unknown, errorInfo?: ErrorInfo): string => {
  const summary = getErrorSummary(error);
  const title = `Frontend error: ${summary}`.slice(0, 120);
  const body = [
    "## What happened?",
    "The Symvolia app showed the global error screen.",
    "",
    "## Error details",
    "```text",
    formatErrorDetails(error),
    "```",
    "",
    "## React component stack",
    "```text",
    truncate(errorInfo?.componentStack?.trim() || "Not available."),
    "```",
    "",
    "## Page",
    "```text",
    window.location.href,
    "```",
    "",
    "## Environment",
    `- Time: ${new Date().toISOString()}`,
    `- User agent: ${navigator.userAgent}`,
    "",
    "Please review this report before submitting. Remove anything you do not want to share publicly.",
  ].join("\n");

  const params = new URLSearchParams({ title, body });
  return `${ISSUE_URL}?${params.toString()}`;
};

type ErrorBoundaryFallbackProps = {
  error?: unknown;
  errorInfo?: ErrorInfo;
};

export const ErrorBoundaryFallback = ({
  error,
  errorInfo,
}: ErrorBoundaryFallbackProps) => {
  const issueUrl = buildIssueUrl(error, errorInfo);

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        bgcolor: "background.default",
        px: 3,
        textAlign: "center",
      }}
    >
      <Typography variant="h5" fontWeight="bold">
        Sorry, something went wrong.
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 440 }}>
        Please reload the app and try again.
      </Typography>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        justifyContent="center"
      >
        <Button startIcon={<RefreshIcon />} onClick={handleReload} size="large">
          Reload app
        </Button>
        <Button
          component="a"
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<GitHubIcon />}
          size="large"
          variant="outlined"
        >
          Report issue
        </Button>
      </Stack>
    </Box>
  );
};

export const RouteErrorBoundary = () => {
  const error = useRouteError();

  useEffect(() => {
    console.error("Uncaught route error", error);
  }, [error]);

  return <ErrorBoundaryFallback error={error} />;
};

class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  state: GlobalErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: unknown): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught app error", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
        />
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
