import { CRED_MULT } from "../../ignition/config/deployments.js";

export type MockRegistration = {
  accountIndex: number;
  nationality: string;
};

export type MockStatement = {
  accountIndex: number;
  forum: string;
  content: string;
  initialSupport?: number;
};

export type MockSupport = {
  accountIndex: number;
  forum: string;
  statementIndex: number;
  value: number;
};

export const MOCK_REGISTRATIONS: MockRegistration[] = [
  { accountIndex: 0, nationality: "USA" },
  { accountIndex: 1, nationality: "" },
  { accountIndex: 1, nationality: "CAN" },
  { accountIndex: 2, nationality: "" },
];

export const MOCK_STATEMENTS: MockStatement[] = [
  {
    accountIndex: 0,
    forum: "USA",
    content: "Access to high-quality medical care is a human right.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content: "We need to consider and prevent the potential downsides of AI.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content: "Loneliness is an epidemic. Touch grass, find a friend.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content: "We're better together.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content: "I want something to believe in.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content: "Nothing heals like a good chocolate chip cookie!",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content: "We're in the longest government shutdown in our history.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content: "All work and now play makes Hannah and sad girl",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content:
      "We should continue providing SNAP benefits despite the government shutdown",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "USA",
    content:
      "There should be a minimum of 4 weeks PTO for primary care givers.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "global",
    content: "Gazan's deserve to not starve.",
  },
  {
    accountIndex: 1,
    forum: "global",
    content: "Cooperation and peace > arms races and mistrust",
  },
  { accountIndex: 2, forum: "global", content: "Stand with Ukraine." },
  {
    accountIndex: 1,
    forum: "CAN",
    content: "Universal healthcare is something to be proud of.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 1,
    forum: "CAN",
    content: "We need more affordable housing in our cities.",
    initialSupport: 10 * CRED_MULT,
  },
  {
    accountIndex: 1,
    forum: "CAN",
    content: "Reconciliation with Indigenous peoples must be a priority.",
    initialSupport: 10 * CRED_MULT,
  },
];

export const MOCK_SUPPORT: MockSupport[] = [
  {
    accountIndex: 1,
    forum: "global",
    statementIndex: 0,
    value: 10 * CRED_MULT,
  },
  {
    accountIndex: 2,
    forum: "global",
    statementIndex: 0,
    value: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "global",
    statementIndex: 1,
    value: 10 * CRED_MULT,
  },
  {
    accountIndex: 2,
    forum: "global",
    statementIndex: 1,
    value: 10 * CRED_MULT,
  },
  {
    accountIndex: 0,
    forum: "global",
    statementIndex: 2,
    value: 10 * CRED_MULT,
  },
  {
    accountIndex: 1,
    forum: "global",
    statementIndex: 2,
    value: 10 * CRED_MULT,
  },
];
