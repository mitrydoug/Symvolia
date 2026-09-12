// Auto-extracted from blockchain/artifacts/contracts/Forum.sol/Forum.json
// Do not edit manually -- re-extract from Hardhat artifacts when contracts change.

export default [
  {
    "inputs": [
      {
        "internalType": "contract ASymvoliaRegistry",
        "name": "_symvoliaRegistry",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "_nationality",
        "type": "string"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "maxRankedStatements",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "creditAllowanceIntervalSeconds",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "engagementWindowSeconds",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "maxStatementLength",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "userCreditAllowancePerInterval",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "userStartingCredits",
            "type": "uint256"
          },
          {
            "internalType": "int256",
            "name": "minStatementSupportToRank",
            "type": "int256"
          },
          {
            "internalType": "uint256",
            "name": "minAdjustmentIntervalSeconds",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "creditMultiplier",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "refundPenaltyBps",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "decaySpeedupFactor",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "statementBurstCapacity",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "statementRefillIntervalSeconds",
            "type": "uint256"
          }
        ],
        "internalType": "struct Forum.ForumConfig",
        "name": "_config",
        "type": "tuple"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      }
    ],
    "name": "AddressEmptyCode",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "statementId",
        "type": "uint256"
      }
    ],
    "name": "DuplicateAdjustment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EmptyStatement",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FailedCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "available",
        "type": "uint256"
      },
      {
        "internalType": "int256",
        "name": "required",
        "type": "int256"
      }
    ],
    "name": "InsufficientCredits",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "statementId",
        "type": "uint256"
      }
    ],
    "name": "InvalidStatementId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotMember",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rank",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "rankedCount",
        "type": "uint256"
      }
    ],
    "name": "RankOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "start",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "statementCount",
        "type": "uint256"
      }
    ],
    "name": "StartOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "retryAfterTimestamp",
        "type": "uint256"
      }
    ],
    "name": "StatementRateLimited",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "length",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxLength",
        "type": "uint256"
      }
    ],
    "name": "StatementTooLong",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "fromTimestamp",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "toTimestamp",
        "type": "uint256"
      }
    ],
    "name": "TimestampOrderInvalid",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "UserNotRegistered",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "statement",
        "type": "string"
      }
    ],
    "name": "StatementAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "statementId",
        "type": "uint256"
      }
    ],
    "name": "StatementEngaged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "statementId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "previousRank",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "newRank",
        "type": "int256"
      }
    ],
    "name": "StatementRankChanged",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_statementText",
        "type": "string"
      },
      {
        "internalType": "int256",
        "name": "_initialSupport",
        "type": "int256"
      }
    ],
    "name": "addStatement",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "statementId",
            "type": "uint256"
          },
          {
            "internalType": "int256",
            "name": "value",
            "type": "int256"
          },
          {
            "internalType": "enum Forum.SupportAdjustmentType",
            "name": "adjustmentType",
            "type": "uint8"
          }
        ],
        "internalType": "struct Forum.SupportAdjustment[]",
        "name": "_supportAdjustments",
        "type": "tuple[]"
      }
    ],
    "name": "adjustSupport",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creditAllowanceIntervalSeconds",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creditMultiplier",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decaySpeedupFactor",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "engagementWindowSeconds",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_rank",
        "type": "uint256"
      }
    ],
    "name": "getRankedStatement",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "text",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "createdTimestamp",
            "type": "uint256"
          },
          {
            "internalType": "int256",
            "name": "support",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "rank",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "peakRank",
            "type": "int256"
          }
        ],
        "internalType": "struct Forum.Statement",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_start",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_limit",
        "type": "uint256"
      }
    ],
    "name": "getRankedStatementsPage",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "text",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "createdTimestamp",
            "type": "uint256"
          },
          {
            "internalType": "int256",
            "name": "support",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "rank",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "peakRank",
            "type": "int256"
          }
        ],
        "internalType": "struct Forum.Statement[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getRankingThreshold",
    "outputs": [
      {
        "internalType": "int256",
        "name": "",
        "type": "int256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStatementAllowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "available",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nextRefillTimestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256[]",
        "name": "_statementIds",
        "type": "uint256[]"
      }
    ],
    "name": "getStatementsById",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "text",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "createdTimestamp",
            "type": "uint256"
          },
          {
            "internalType": "int256",
            "name": "support",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "rank",
            "type": "int256"
          },
          {
            "internalType": "int256",
            "name": "peakRank",
            "type": "int256"
          }
        ],
        "internalType": "struct Forum.Statement[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getUserBalance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getUserLastUpdated",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getUserStatementSupport",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "statementId",
            "type": "uint256"
          },
          {
            "internalType": "int256",
            "name": "support",
            "type": "int256"
          }
        ],
        "internalType": "struct Forum.StatementSupport[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isMember",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxRankedStatements",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxStatementLength",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minAdjustmentIntervalSeconds",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minStatementSupportToRank",
    "outputs": [
      {
        "internalType": "int256",
        "name": "",
        "type": "int256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes[]",
        "name": "data",
        "type": "bytes[]"
      }
    ],
    "name": "multicall",
    "outputs": [
      {
        "internalType": "bytes[]",
        "name": "results",
        "type": "bytes[]"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nationality",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rankedCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "refundPenaltyBps",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "statementBuckets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "tokens",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastRefill",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "statementBurstCapacity",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "statementCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "statementRankings",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "statementRefillIntervalSeconds",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "statements",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "text",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "createdTimestamp",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "int256",
            "name": "value",
            "type": "int256"
          },
          {
            "internalType": "uint256",
            "name": "lastUpdated",
            "type": "uint256"
          }
        ],
        "internalType": "struct Forum.Support",
        "name": "support",
        "type": "tuple"
      },
      {
        "internalType": "int256",
        "name": "rank",
        "type": "int256"
      },
      {
        "internalType": "int256",
        "name": "peakRank",
        "type": "int256"
      },
      {
        "internalType": "uint256",
        "name": "lastEngagementEventTimestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symvoliaRegistry",
    "outputs": [
      {
        "internalType": "contract ASymvoliaRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "userCreditAllowancePerInterval",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "userCredits",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "credits",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastUpdated",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "userStartingCredits",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "userSupportMap",
    "outputs": [
      {
        "internalType": "int256",
        "name": "value",
        "type": "int256"
      },
      {
        "internalType": "uint256",
        "name": "lastUpdated",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
