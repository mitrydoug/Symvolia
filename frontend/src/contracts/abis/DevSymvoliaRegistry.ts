// Auto-extracted from blockchain/artifacts/contracts/DevSymvoliaRegistry.sol/DevSymvoliaRegistry.json
// Do not edit manually — re-extract from Hardhat artifacts when contracts change.

export default [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "existing",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "provided",
        "type": "string"
      }
    ],
    "name": "NationalityMismatch",
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
    "inputs": [
      {
        "internalType": "address",
        "name": "_userAddress",
        "type": "address"
      }
    ],
    "name": "getUserIdentifier",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_userAddress",
        "type": "address"
      }
    ],
    "name": "getUserRegistration",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "uniqueIdentifier",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "nationality",
            "type": "string"
          },
          {
            "internalType": "address[]",
            "name": "registeredAddresses",
            "type": "address[]"
          },
          {
            "internalType": "uint256",
            "name": "registrationTimestamp",
            "type": "uint256"
          }
        ],
        "internalType": "struct Registration",
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
        "internalType": "address",
        "name": "_userAddress",
        "type": "address"
      }
    ],
    "name": "isRegistered",
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
    "inputs": [
      {
        "internalType": "string",
        "name": "nationality",
        "type": "string"
      }
    ],
    "name": "register",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "userIdFromAddress",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
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
    "name": "userRegistrations",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "uniqueIdentifier",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "nationality",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "registrationTimestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
