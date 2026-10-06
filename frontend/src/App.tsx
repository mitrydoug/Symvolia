import { FC } from "react";

import {
  createHashRouter,
  Navigate,
  RouterProvider,
  useParams,
} from "react-router-dom";
import Home from "./components/Home.tsx";

import Root from "./components/Root.tsx";
import MySupport from "./components/MySupport.tsx";
import MyStatements from "./components/MyStatements.tsx";
import Starred from "./components/Starred.tsx";
import CreateStatementForm from "./components/CreateStatementForm.tsx";
import { UserVoteProvider } from "./state/UserVotes.tsx";
import { CssBaseline, ThemeProvider } from "@mui/material";
import GetVerified from "./components/GetVerified.tsx";
import StatementPage from "./components/StatementPage.tsx";
import GlobalErrorBoundary, {
  RouteErrorBoundary,
} from "./components/GlobalErrorBoundary.tsx";
import Settings from "./components/Settings.tsx";
import HowItWorks from "./components/HowItWorks.tsx";
import Welcome from "./components/Welcome.tsx";

import { theme, THEME_MODE_STORAGE_KEY } from "./theme.ts";
import {
  ForumProvider,
  getStoredForumSlug,
  slugToForum,
} from "./state/Forum.tsx";
import { hasSeenWelcome } from "./state/welcome.ts";
import { LocalSearchProvider } from "./state/LocalSearch.tsx";
import MobileComingSoon from "./components/MobileComingSoon.tsx";
import useIsMobileVisitor from "./hooks/useIsMobileVisitor.ts";

/**
 * Redirects bare `/` to the last-visited forum slug (from localStorage),
 * falling back to the "earth" (global) forum. First-time visitors are sent to
 * the full-page welcome screen instead.
 */
const RootRedirect: FC = () => {
  if (!hasSeenWelcome()) {
    return <Navigate to="/welcome" replace />;
  }
  const slug = getStoredForumSlug();
  return <Navigate to={`/${slug}`} replace />;
};

/**
 * Validates the `:forumSlug` param. If the slug is unrecognised, redirects
 * to the stored/default forum.
 */
const ValidateForumSlug: FC = () => {
  const { forumSlug } = useParams<{ forumSlug: string }>();
  const resolved = forumSlug ? slugToForum(forumSlug) : undefined;

  if (!resolved) {
    const fallback = getStoredForumSlug();
    return <Navigate to={`/${fallback}`} replace />;
  }

  return <Root />;
};

/** Routes nested under the Root layout (shared shell). */
const forumChildren = [
  {
    Component: Home,
    index: true,
  },
  {
    path: "my-support",
    Component: MySupport,
  },
  {
    path: "my-statements",
    Component: MyStatements,
  },
  {
    path: "starred",
    Component: Starred,
  },
  {
    path: "settings",
    Component: Settings,
  },
  {
    path: "how-it-works",
    Component: HowItWorks,
  },
  {
    path: "write",
    Component: CreateStatementForm,
  },
  {
    path: "statement/:statementId",
    Component: StatementPage,
  },
];

const router = createHashRouter([
  {
    path: "/verify",
    Component: GetVerified,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/welcome",
    Component: Welcome,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/:forumSlug",
    Component: ValidateForumSlug,
    errorElement: <RouteErrorBoundary />,
    children: forumChildren,
  },
  {
    /* Bare "/" redirects to the last-visited forum (localStorage) */
    path: "/",
    Component: RootRedirect,
    errorElement: <RouteErrorBoundary />,
  },
]);

export const App: FC = () => {
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      modeStorageKey={THEME_MODE_STORAGE_KEY}
      disableTransitionOnChange
    >
      <CssBaseline />
      <AppContent />
    </ThemeProvider>
  );
};

/**
 * Renders the app, or the mobile "coming soon" placeholder for mobile visitors.
 * Split out from `App` so the mobile-detection hook runs inside `ThemeProvider`
 * (it depends on the theme's breakpoints).
 */
const AppContent: FC = () => {
  const isMobileVisitor = useIsMobileVisitor();

  if (isMobileVisitor) {
    return <MobileComingSoon />;
  }

  return (
    <GlobalErrorBoundary>
      <ForumProvider>
        <LocalSearchProvider>
          <UserVoteProvider>
            <RouterProvider router={router} />
          </UserVoteProvider>
        </LocalSearchProvider>
      </ForumProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
