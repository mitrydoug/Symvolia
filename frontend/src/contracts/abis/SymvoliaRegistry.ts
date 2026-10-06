// Auto-extracted from blockchain/artifacts/contracts/SymvoliaRegistry.sol/SymvoliaRegistry.json
// Do not edit manually — re-extract from Hardhat artifacts when contracts change.

export default [
  {
    inputs: [
      {
        internalType: "string",
        name: "_scope",
        type: "string",
      },
      {
        internalType: "string",
        name: "_domain",
        type: "string",
      },
      {
        internalType: "address",
        name: "_verifierAddress",
        type: "address",
      },
      {
        internalType: "bool",
        name: "_devMode",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "existingId",
        type: "bytes32",
      },
    ],
    name: "AddressAlreadyRegistered",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "boundChainId",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "currentChainId",
        type: "uint256",
      },
    ],
    name: "ChainIdMismatch",
    type: "error",
  },
  {
    inputs: [],
    name: "DevProofsNotAllowed",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "expectedDomain",
        type: "string",
      },
      {
        internalType: "string",
        name: "expectedScope",
        type: "string",
      },
    ],
    name: "InvalidScope",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "existing",
        type: "string",
      },
      {
        internalType: "string",
        name: "provided",
        type: "string",
      },
    ],
    name: "NationalityMismatch",
    type: "error",
  },
  {
    inputs: [],
    name: "ProofInvalid",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "boundSender",
        type: "address",
      },
      {
        internalType: "address",
        name: "caller",
        type: "address",
      },
    ],
    name: "SenderAddressMismatch",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
    ],
    name: "UserNotRegistered",
    type: "error",
  },
  {
    inputs: [],
    name: "devMode",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "domain",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_userAddress",
        type: "address",
      },
    ],
    name: "getUserIdentifier",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_userAddress",
        type: "address",
      },
    ],
    name: "getUserRegistration",
    outputs: [
      {
        components: [
          {
            internalType: "bytes32",
            name: "uniqueIdentifier",
            type: "bytes32",
          },
          {
            internalType: "string",
            name: "nationality",
            type: "string",
          },
          {
            internalType: "address[]",
            name: "registeredAddresses",
            type: "address[]",
          },
          {
            internalType: "uint256",
            name: "registrationTimestamp",
            type: "uint256",
          },
        ],
        internalType: "struct Registration",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_userAddress",
        type: "address",
      },
    ],
    name: "isRegistered",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes32",
            name: "version",
            type: "bytes32",
          },
          {
            components: [
              {
                internalType: "bytes32",
                name: "vkeyHash",
                type: "bytes32",
              },
              {
                internalType: "bytes",
                name: "proof",
                type: "bytes",
              },
              {
                internalType: "bytes32[]",
                name: "publicInputs",
                type: "bytes32[]",
              },
            ],
            internalType: "struct ProofVerificationData",
            name: "proofVerificationData",
            type: "tuple",
          },
          {
            internalType: "bytes",
            name: "committedInputs",
            type: "bytes",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "validityPeriodInSeconds",
                type: "uint256",
              },
              {
                internalType: "string",
                name: "domain",
                type: "string",
              },
              {
                internalType: "string",
                name: "scope",
                type: "string",
              },
              {
                internalType: "bool",
                name: "devMode",
                type: "bool",
              },
            ],
            internalType: "struct ServiceConfig",
            name: "serviceConfig",
            type: "tuple",
          },
        ],
        internalType: "struct ProofVerificationParams",
        name: "_params",
        type: "tuple",
      },
    ],
    name: "register",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "scope",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "userIdFromAddress",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "userRegistrations",
    outputs: [
      {
        internalType: "bytes32",
        name: "uniqueIdentifier",
        type: "bytes32",
      },
      {
        internalType: "string",
        name: "nationality",
        type: "string",
      },
      {
        internalType: "uint256",
        name: "registrationTimestamp",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "zkPassportVerifier",
    outputs: [
      {
        internalType: "contract IZKPassportVerifier",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
