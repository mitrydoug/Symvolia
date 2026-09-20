import { type ReactNode, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import BalanceRoundedIcon from "@mui/icons-material/BalanceRounded";
import BookmarkBorderRoundedIcon from "@mui/icons-material/BookmarkBorderRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LanRoundedIcon from "@mui/icons-material/LanRounded";
import LightbulbRoundedIcon from "@mui/icons-material/LightbulbRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
} from "recharts";

const colors = {
  canvas: "#090d12",
  sidebar: "#0c1117",
  panel: "#10161e",
  panelRaised: "#151c25",
  border: "#252d38",
  borderSoft: "#1b232d",
  text: "#eef1f4",
  muted: "#8c96a3",
  purple: "#8b5cf6",
  purpleSoft: "#a78bfa",
  green: "#31c48d",
  red: "#ef6461",
};

const statements = [
  {
    id: 1,
    title: "Universal basic income should replace fragmented welfare programs",
    topic: "Economy",
    excerpt:
      "A single, predictable income floor would reduce administrative overhead while giving households more agency in how support is used.",
    time: "18 min ago",
    net: 1842,
    activity: [18, 22, 19, 31, 35, 42, 58, 61, 74],
  },
  {
    id: 2,
    title: "Cities should make public transit fare-free by 2030",
    topic: "Infrastructure",
    excerpt:
      "Treating mobility as civic infrastructure could improve access to work, reduce congestion, and simplify transit operations.",
    time: "42 min ago",
    net: 1337,
    activity: [12, 18, 24, 22, 39, 46, 43, 57, 66],
  },
  {
    id: 3,
    title: "AI-generated political advertising should require disclosure",
    topic: "Technology",
    excerpt:
      "Clear provenance standards would help voters distinguish synthetic persuasion from verified campaign communication.",
    time: "1 hr ago",
    net: 1198,
    activity: [8, 15, 13, 27, 30, 38, 49, 47, 59],
  },
  {
    id: 4,
    title: "National elections should use ranked-choice voting",
    topic: "Democracy",
    excerpt:
      "Preference ranking can reduce spoiler effects and encourage candidates to appeal beyond a narrow political base.",
    time: "2 hrs ago",
    net: 986,
    activity: [11, 9, 21, 24, 32, 29, 41, 48, 53],
  },
  {
    id: 5,
    title: "Public research funded by taxpayers should be open access",
    topic: "Science",
    excerpt:
      "Removing paywalls around publicly funded work would accelerate discovery and broaden participation in research.",
    time: "3 hrs ago",
    net: 854,
    activity: [6, 12, 17, 15, 24, 31, 37, 45, 49],
  },
];

const topics = [
  ["Democracy", 128, BalanceRoundedIcon],
  ["Economy", 96, TrendingUpRoundedIcon],
  ["Technology", 84, LanRoundedIcon],
  ["Society", 73, GroupsRoundedIcon],
  ["Governance", 61, GavelRoundedIcon],
  ["Ideas", 49, LightbulbRoundedIcon],
] as const;

const voteDistribution = [
  { name: "Support", value: 62, color: colors.green },
  { name: "Neutral", value: 16, color: "#667281" },
  { name: "Oppose", value: 22, color: colors.red },
];

const activityData = [
  { day: "M", statements: 34, votes: 68 },
  { day: "T", statements: 46, votes: 82 },
  { day: "W", statements: 39, votes: 76 },
  { day: "T", statements: 58, votes: 94 },
  { day: "F", statements: 52, votes: 88 },
  { day: "S", statements: 67, votes: 104 },
  { day: "S", statements: 73, votes: 116 },
];

const tagColors: Record<string, string> = {
  Economy: "#d8a943",
  Infrastructure: "#4aa8b5",
  Technology: "#607de0",
  Democracy: "#a77be0",
  Science: "#4faf86",
};

const panelSx = {
  bgcolor: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: 2,
};

interface StatCardProps {
  icon: ReactNode;
  value: string;
  label: string;
  color: string;
}

const StatCard = ({ icon, value, label, color }: StatCardProps) => (
  <Box sx={{ ...panelSx, p: 1.6, minWidth: 0 }}>
    <Stack direction="row" spacing={1.25} alignItems="center">
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.25,
          display: "grid",
          placeItems: "center",
          color,
          bgcolor: `${color}16`,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.05 }}>
          {value}
        </Typography>
        <Typography sx={{ color: colors.muted, fontSize: 11.5, mt: 0.35 }}>
          {label}
        </Typography>
      </Box>
    </Stack>
  </Box>
);

const EditorialDashboard = () => {
  const [activeNav, setActiveNav] = useState("Home");
  const [activeTab, setActiveTab] = useState("Trending");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<number>>(() => new Set([2]));
  const [votes, setVotes] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      statements.map((statement) => [statement.id, statement.net]),
    ),
  );
  const [timeframe, setTimeframe] = useState("7d");
  const [page, setPage] = useState(1);
  const [postOpen, setPostOpen] = useState(false);
  const [network, setNetwork] = useState("v1.4.2 · Base");

  const visibleStatements = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = statements.filter((statement) => {
      const matchesQuery =
        !normalized ||
        statement.title.toLowerCase().includes(normalized) ||
        statement.excerpt.toLowerCase().includes(normalized) ||
        statement.topic.toLowerCase().includes(normalized);
      const matchesTopic = !topic || statement.topic === topic;
      const matchesNavigation =
        activeNav !== "Starred" || starred.has(statement.id);
      return matchesQuery && matchesTopic && matchesNavigation;
    });

    if (activeTab === "Newest") return [...filtered].reverse();
    if (activeTab === "Most Voted") {
      return [...filtered].sort((a, b) => votes[b.id] - votes[a.id]);
    }
    return filtered;
  }, [activeNav, activeTab, query, starred, topic, votes]);

  const toggleStar = (id: number) => {
    setStarred((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const castVote = (id: number, delta: number) => {
    setVotes((current) => ({ ...current, [id]: current[id] + delta }));
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: colors.canvas,
        color: colors.text,
        fontFamily: '"Inter Tight", "Arial Narrow", sans-serif',
      }}
    >
      <Box
        component="header"
        sx={{
          height: 58,
          px: 2.25,
          display: "grid",
          gridTemplateColumns: "220px minmax(320px, 620px) 1fr",
          alignItems: "center",
          gap: 2,
          borderBottom: `1px solid ${colors.border}`,
          bgcolor: colors.sidebar,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Stack direction="row" spacing={1.1} alignItems="center">
          <Box
            component="img"
            src="./confluence-logo-rounded.svg"
            alt=""
            sx={{ width: 31, height: 31, borderRadius: 1 }}
          />
          <Typography
            sx={{ fontWeight: 900, fontSize: 19, letterSpacing: -0.4 }}
          >
            Symvolia
          </Typography>
        </Stack>

        <TextField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search statements, topics, or people"
          size="small"
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon
                    sx={{ color: colors.muted, fontSize: 19 }}
                  />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Box
                    component="kbd"
                    sx={{
                      color: colors.muted,
                      border: `1px solid ${colors.border}`,
                      bgcolor: colors.panelRaised,
                      borderRadius: 0.8,
                      px: 0.7,
                      py: 0.15,
                      fontSize: 10,
                      fontFamily: "inherit",
                    }}
                  >
                    ⌘K
                  </Box>
                </InputAdornment>
              ),
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              height: 36,
              color: colors.text,
              bgcolor: colors.panel,
              borderRadius: 1.5,
              fontSize: 13,
              "& fieldset": { borderColor: colors.border },
              "&:hover fieldset": { borderColor: "#394351" },
              "&.Mui-focused fieldset": { borderColor: colors.purple },
            },
          }}
        />

        <Stack
          direction="row"
          spacing={1.3}
          alignItems="center"
          justifyContent="flex-end"
        >
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => setPostOpen(true)}
            sx={{
              bgcolor: colors.purple,
              color: "white",
              fontWeight: 800,
              px: 1.8,
              borderRadius: 1.3,
              boxShadow: "none",
              "&:hover": { bgcolor: "#7c4ee8", boxShadow: "none" },
            }}
          >
            Post a Statement
          </Button>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: "#233044",
              color: colors.purpleSoft,
              fontSize: 12,
              fontWeight: 800,
              border: `1px solid ${colors.border}`,
            }}
          >
            MS
          </Avatar>
        </Stack>
      </Box>

      <Box
        component="aside"
        sx={{
          position: "fixed",
          top: 58,
          bottom: 0,
          left: 0,
          width: 220,
          bgcolor: colors.sidebar,
          borderRight: `1px solid ${colors.border}`,
          px: 1.5,
          py: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography
          sx={{
            color: colors.muted,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.2,
            px: 1.2,
            mb: 0.7,
          }}
        >
          NAVIGATION
        </Typography>
        {[
          ["Home", HomeRoundedIcon],
          ["Discussions", ForumOutlinedIcon],
          ["Starred", StarBorderRoundedIcon],
          ["Saved", BookmarkBorderRoundedIcon],
        ].map(([label, Icon]) => (
          <ButtonBase
            key={label as string}
            onClick={() => setActiveNav(label as string)}
            sx={{
              width: "100%",
              justifyContent: "flex-start",
              gap: 1.2,
              px: 1.2,
              py: 0.85,
              mb: 0.35,
              borderRadius: 1.2,
              color: activeNav === label ? colors.text : colors.muted,
              bgcolor: activeNav === label ? "#24202f" : "transparent",
              borderLeft: `2px solid ${activeNav === label ? colors.purple : "transparent"}`,
              "&:hover": { bgcolor: colors.panelRaised, color: colors.text },
            }}
          >
            <Icon
              sx={{
                fontSize: 19,
                color: activeNav === label ? colors.purpleSoft : "inherit",
              }}
            />
            <Typography
              sx={{ fontSize: 13, fontWeight: activeNav === label ? 750 : 600 }}
            >
              {label as string}
            </Typography>
          </ButtonBase>
        ))}

        <Divider sx={{ borderColor: colors.border, my: 1.6 }} />
        <Typography
          sx={{
            color: colors.muted,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1.2,
            px: 1.2,
            mb: 0.7,
          }}
        >
          ACCOUNT
        </Typography>
        <ButtonBase
          onClick={() => setActiveNav("Settings")}
          sx={{
            width: "100%",
            justifyContent: "flex-start",
            gap: 1.2,
            px: 1.2,
            py: 0.85,
            borderRadius: 1.2,
            color: colors.muted,
            "&:hover": { bgcolor: colors.panelRaised, color: colors.text },
          }}
        >
          <SettingsOutlinedIcon sx={{ fontSize: 19 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Settings
          </Typography>
        </ButtonBase>

        <Box sx={{ mt: "auto" }}>
          <Typography
            sx={{ color: colors.muted, fontSize: 10, px: 1, mb: 0.7 }}
          >
            NETWORK
          </Typography>
          <Select
            value={network}
            onChange={(event) => setNetwork(event.target.value)}
            size="small"
            fullWidth
            sx={{
              color: colors.text,
              bgcolor: colors.panel,
              fontSize: 11.5,
              height: 34,
              borderRadius: 1.2,
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: colors.border,
              },
              ".MuiSvgIcon-root": { color: colors.muted },
            }}
          >
            <MenuItem value="v1.4.2 · Base">v1.4.2 · Base</MenuItem>
            <MenuItem value="v1.4.2 · Local">v1.4.2 · Local</MenuItem>
          </Select>
        </Box>
      </Box>

      <Box component="main" sx={{ ml: "220px", p: 2.5, minWidth: 0 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 2,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 1.25,
                mb: 2,
              }}
            >
              <StatCard
                icon={<ForumOutlinedIcon fontSize="small" />}
                value="12,842"
                label="Statements"
                color="#6f91e8"
              />
              <StatCard
                icon={<GroupsRoundedIcon fontSize="small" />}
                value="48,209"
                label="Participants"
                color={colors.green}
              />
              <StatCard
                icon={<BalanceRoundedIcon fontSize="small" />}
                value="1.8M"
                label="Votes Cast"
                color="#e2b14c"
              />
              <StatCard
                icon={<CheckCircleRoundedIcon fontSize="small" />}
                value="99.8%"
                label="Uptime"
                color={colors.purpleSoft}
              />
            </Box>

            <Box sx={{ ...panelSx, overflow: "hidden" }}>
              <Box
                sx={{
                  px: 2,
                  pt: 1.5,
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography sx={{ fontWeight: 850, fontSize: 15 }}>
                    Top Statements
                  </Typography>
                  {topic && (
                    <Chip
                      label={`${topic} ×`}
                      size="small"
                      onClick={() => setTopic(null)}
                      sx={{
                        color: colors.purpleSoft,
                        bgcolor: "#241c35",
                        fontSize: 11,
                      }}
                    />
                  )}
                </Stack>
                <Stack direction="row" spacing={2.5} sx={{ mt: 1.3 }}>
                  {["Trending", "Most Voted", "Newest"].map((tab) => (
                    <ButtonBase
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      sx={{
                        color: activeTab === tab ? colors.text : colors.muted,
                        fontSize: 12,
                        fontWeight: 750,
                        pb: 1,
                        borderBottom: `2px solid ${activeTab === tab ? colors.purple : "transparent"}`,
                      }}
                    >
                      {tab}
                    </ButtonBase>
                  ))}
                </Stack>
              </Box>

              {visibleStatements.length === 0 ? (
                <Box sx={{ p: 5, textAlign: "center" }}>
                  <Typography sx={{ color: colors.muted, fontSize: 13 }}>
                    No statements match this view.
                  </Typography>
                </Box>
              ) : (
                visibleStatements.map((statement, index) => (
                  <Box
                    key={statement.id}
                    sx={{
                      px: 1.6,
                      py: 1.35,
                      display: "grid",
                      gridTemplateColumns: "30px minmax(0, 1fr) 86px 90px",
                      gap: 1.25,
                      alignItems: "center",
                      borderBottom:
                        index === visibleStatements.length - 1
                          ? "none"
                          : `1px solid ${colors.borderSoft}`,
                      "&:hover": { bgcolor: "#121a23" },
                    }}
                  >
                    <Tooltip
                      title={
                        starred.has(statement.id)
                          ? "Remove from starred"
                          : "Add to starred"
                      }
                    >
                      <IconButton
                        size="small"
                        onClick={() => toggleStar(statement.id)}
                        sx={{
                          color: starred.has(statement.id)
                            ? "#e2b14c"
                            : colors.muted,
                        }}
                      >
                        {starred.has(statement.id) ? (
                          <StarRoundedIcon fontSize="small" />
                        ) : (
                          <StarBorderRoundedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>

                    <Box sx={{ minWidth: 0 }}>
                      <Stack
                        direction="row"
                        spacing={0.9}
                        alignItems="center"
                        sx={{ mb: 0.45 }}
                      >
                        <Typography
                          sx={{
                            color: colors.text,
                            fontWeight: 760,
                            fontSize: 13.5,
                            lineHeight: 1.25,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {statement.title}
                        </Typography>
                        <Chip
                          label={statement.topic}
                          size="small"
                          sx={{
                            height: 19,
                            flexShrink: 0,
                            color: tagColors[statement.topic],
                            bgcolor: `${tagColors[statement.topic]}16`,
                            border: `1px solid ${tagColors[statement.topic]}35`,
                            fontSize: 9.5,
                            fontWeight: 750,
                            ".MuiChip-label": { px: 0.8 },
                          }}
                        />
                      </Stack>
                      <Typography
                        sx={{
                          color: colors.muted,
                          fontSize: 11.5,
                          lineHeight: 1.35,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {statement.excerpt}
                      </Typography>
                      <Typography
                        sx={{ color: "#65707d", fontSize: 10.5, mt: 0.55 }}
                      >
                        {statement.time}
                      </Typography>
                    </Box>

                    <Box sx={{ height: 34 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={statement.activity.map(
                            (value, activityIndex) => ({
                              value,
                              activityIndex,
                            }),
                          )}
                        >
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={colors.purpleSoft}
                            strokeWidth={1.8}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>

                    <Stack
                      direction="row"
                      spacing={0.35}
                      alignItems="center"
                      justifyContent="flex-end"
                    >
                      <Tooltip title="Support">
                        <IconButton
                          size="small"
                          onClick={() => castVote(statement.id, 1)}
                          sx={{
                            color: colors.green,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 1,
                          }}
                        >
                          <ArrowUpwardRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Typography
                        sx={{
                          minWidth: 37,
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 11.5,
                        }}
                      >
                        {votes[statement.id].toLocaleString()}
                      </Typography>
                      <Tooltip title="Oppose">
                        <IconButton
                          size="small"
                          onClick={() => castVote(statement.id, -1)}
                          sx={{
                            color: colors.red,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 1,
                          }}
                        >
                          <ArrowDownwardRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                ))
              )}
            </Box>

            <Stack
              direction="row"
              spacing={0.7}
              justifyContent="center"
              sx={{ mt: 1.5 }}
            >
              {[1, 2, 3, 4].map((number) => (
                <ButtonBase
                  key={number}
                  onClick={() => setPage(number)}
                  sx={{
                    width: 29,
                    height: 29,
                    borderRadius: 1,
                    border: `1px solid ${page === number ? colors.purple : colors.border}`,
                    bgcolor: page === number ? "#251d38" : colors.panel,
                    color: page === number ? colors.purpleSoft : colors.muted,
                    fontSize: 11,
                    fontWeight: 750,
                  }}
                >
                  {number}
                </ButtonBase>
              ))}
              <IconButton
                size="small"
                sx={{
                  width: 29,
                  height: 29,
                  color: colors.muted,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 1,
                }}
              >
                <MoreHorizRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Box>

          <Stack spacing={1.5}>
            <Box sx={{ ...panelSx, p: 1.7 }}>
              <Typography sx={{ fontWeight: 850, fontSize: 14, mb: 1.1 }}>
                Popular Topics
              </Typography>
              <Stack spacing={0.35}>
                {topics.map(([label, count, Icon]) => (
                  <ButtonBase
                    key={label}
                    onClick={() => setTopic(topic === label ? null : label)}
                    sx={{
                      width: "100%",
                      justifyContent: "space-between",
                      px: 0.8,
                      py: 0.65,
                      borderRadius: 1,
                      bgcolor: topic === label ? "#241d34" : "transparent",
                      color: topic === label ? colors.text : colors.muted,
                      "&:hover": {
                        bgcolor: colors.panelRaised,
                        color: colors.text,
                      },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Icon
                        sx={{
                          fontSize: 17,
                          color:
                            topic === label ? colors.purpleSoft : "#6f7b89",
                        }}
                      />
                      <Typography sx={{ fontSize: 12.5, fontWeight: 650 }}>
                        {label}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 10.5, color: colors.muted }}>
                      {count}
                    </Typography>
                  </ButtonBase>
                ))}
              </Stack>
            </Box>

            <Box sx={{ ...panelSx, p: 1.7 }}>
              <Typography sx={{ fontWeight: 850, fontSize: 14 }}>
                Vote Distribution
              </Typography>
              <Box sx={{ height: 145, position: "relative" }}>
                <Box
                  component="svg"
                  viewBox="0 0 120 120"
                  aria-label="Vote distribution: 62% support, 16% neutral, 22% oppose"
                  sx={{
                    width: "100%",
                    height: "100%",
                    transform: "rotate(-90deg)",
                  }}
                >
                  <circle
                    cx="60"
                    cy="60"
                    r="43"
                    fill="none"
                    stroke="#202833"
                    strokeWidth="16"
                  />
                  {voteDistribution.map((entry, index) => {
                    const priorValue = voteDistribution
                      .slice(0, index)
                      .reduce((total, item) => total + item.value, 0);
                    return (
                      <circle
                        key={entry.name}
                        cx="60"
                        cy="60"
                        r="43"
                        pathLength="100"
                        fill="none"
                        stroke={entry.color}
                        strokeWidth="16"
                        strokeDasharray={`${entry.value - 1} ${101 - entry.value}`}
                        strokeDashoffset={-priorValue}
                      />
                    );
                  })}
                </Box>
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeContent: "center",
                    textAlign: "center",
                    pointerEvents: "none",
                  }}
                >
                  <Typography sx={{ fontWeight: 850, fontSize: 17 }}>
                    1.8M
                  </Typography>
                  <Typography sx={{ color: colors.muted, fontSize: 9.5 }}>
                    total votes
                  </Typography>
                </Box>
              </Box>
              <Stack direction="row" justifyContent="center" spacing={1.5}>
                {voteDistribution.map((entry) => (
                  <Stack
                    key={entry.name}
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: entry.color,
                      }}
                    />
                    <Typography sx={{ color: colors.muted, fontSize: 9.5 }}>
                      {entry.name} {entry.value}%
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Box sx={{ ...panelSx, p: 1.7 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography sx={{ fontWeight: 850, fontSize: 14 }}>
                  Activity
                </Typography>
                <Stack direction="row" spacing={0.25}>
                  {["24h", "7d", "30d"].map((range) => (
                    <ButtonBase
                      key={range}
                      onClick={() => setTimeframe(range)}
                      sx={{
                        px: 0.8,
                        py: 0.35,
                        borderRadius: 0.8,
                        fontSize: 9.5,
                        fontWeight: 750,
                        color:
                          timeframe === range
                            ? colors.purpleSoft
                            : colors.muted,
                        bgcolor:
                          timeframe === range ? "#241d34" : "transparent",
                      }}
                    >
                      {range}
                    </ButtonBase>
                  ))}
                </Stack>
              </Stack>
              <Box sx={{ height: 130, mt: 1.2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} barGap={2}>
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: colors.muted, fontSize: 9 }}
                    />
                    <ChartTooltip
                      cursor={{ fill: "#ffffff08" }}
                      contentStyle={{
                        background: colors.panelRaised,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                    />
                    <Bar
                      dataKey="statements"
                      fill="#5f6f86"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="votes"
                      fill={colors.purple}
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
              <Stack direction="row" spacing={1.5} justifyContent="center">
                <Typography sx={{ color: colors.muted, fontSize: 9.5 }}>
                  ■ Statements
                </Typography>
                <Typography sx={{ color: colors.purpleSoft, fontSize: 9.5 }}>
                  ■ Votes
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Box>

      <Dialog
        open={postOpen}
        onClose={() => setPostOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: colors.panel,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              minWidth: 440,
            },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 850 }}>Post a Statement</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            placeholder="State a clear, debatable proposition…"
            sx={{
              mt: 1,
              "& .MuiOutlinedInput-root": { color: colors.text },
              "& fieldset": { borderColor: colors.border },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setPostOpen(false)}
            sx={{ color: colors.muted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => setPostOpen(false)}
            sx={{ bgcolor: colors.purple }}
          >
            Publish
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EditorialDashboard;
