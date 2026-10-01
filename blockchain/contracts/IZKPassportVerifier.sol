// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/**
 * @notice The data that can be bound to the proof
 */
struct BoundData {
    // The address of the ID holder
    address senderAddress;
    // The chain id (block.chainid)
    uint256 chainId;
    // The custom data (encoded as ASCII string)
    string customData;
}

/**
 * @notice The data that can be disclosed by the proof
 */
struct DisclosedData {
    // The name of the ID holder (includes the angular brackets from the MRZ)
    string name;
    // The issuing country of the ID
    string issuingCountry;
    // The nationality of the ID holder
    string nationality;
    // The gender of the ID holder
    string gender;
    // The birth date of the ID holder
    string birthDate;
    // The expiry date of the ID
    string expiryDate;
    // The document number of the ID
    string documentNumber;
    // The type of the document
    string documentType;
}

// ProofVerificationParams
// │
// ├── bytes32 version                        // Version identifier of the verifier
// │
// ├── ProofVerificationData proofVerificationData
// │   ├── bytes32 vkeyHash                   // Verification key hash
// │   ├── bytes proof                        // The actual ZK proof
// │   └── bytes32[] publicInputs             // Array of public inputs (7+ elements)
// │       │                                  // Use PublicInputsCast.asStruct() for structured access:
// │       ├── [0] certificate_registry_root  // Field - struct.certificateRegistryRoot
// │       ├── [1] circuit_registry_root      // Field - struct.circuitRegistryRoot
// │       ├── [2] current_date               // u64 - PublicInputsCast.getCurrentDate(struct)
// │       ├── [3] service_scope              // Field - struct.serviceScope
// │       ├── [4] service_subscope           // Field - struct.serviceSubscope
// │       ├── [5:5+N] param_commitments      // Field[N] - PublicInputsCast.getParamCommitment(array, index)
// │       ├── [5+N] nullifier_type           // u8 - PublicInputsCast.getNullifierType(array, paramCount)
// │       └── [6+N] scoped_nullifier         // Field - PublicInputsCast.getScopedNullifier(array, paramCount)
// │
// ├── bytes committedInputs              // Preimages of param_commitments
// │
// └── ServiceConfig serviceConfig
//     ├── uint256 validityPeriodInSeconds    // How long the proof is valid
//     ├── string domain                      // Service domain
//     ├── string scope                       // Service scope
//     └── bool devMode                       // Development mode flag
struct ProofVerificationParams {
    bytes32 version;
    ProofVerificationData proofVerificationData;
    bytes committedInputs;
    ServiceConfig serviceConfig;
}

struct ProofVerificationData {
    bytes32 vkeyHash;
    bytes proof;
    bytes32[] publicInputs;
}

struct ServiceConfig {
    uint256 validityPeriodInSeconds;
    string domain;
    string scope;
    bool devMode;
}

enum FaceMatchMode {
    NONE,
    REGULAR,
    STRICT
}

enum OS {
    ANY,
    IOS,
    ANDROID
}

/**
 * @notice The public interface for the ZKPassport verifier contract
 */
interface IZKPassportVerifier {
    /**
     * @notice Verifies a proof from ZKPassport
     * @param params The proof verification parameters
     * @return verified True if the proof is valid, false otherwise
     * @return uniqueIdentifier The unique identifier associated to the identity document that generated the proof
     * @return helper The ZKPassportHelper contract that can be used to verify the information or conditions that are checked by the proof
     */
    function verify(
        ProofVerificationParams calldata params
    )
        external
        returns (
            bool verified,
            bytes32 uniqueIdentifier,
            IZKPassportHelper helper
        );
}

/**
 * @notice You can use to helper contract verifying the information or conditions that are checked by the proof
 */
interface IZKPassportHelper {
    /**
     * @notice Verifies that the proof was generated for the given domain and scope
     * @param publicInputs The public inputs of the proof
     * @param domain The domain to check against (must match exactly the domain you specified in the SDK)
     * @param scope The scope to check against (must match exactly the scope you specified in the request using the TypeScript SDK)
     * @return True if the proof was generated for the given domain and scope, false otherwise
     */
    function verifyScopes(
        bytes32[] calldata publicInputs,
        string calldata domain,
        string calldata scope
    ) external pure returns (bool);

    // ===== Helper functions to get the information revealed by the proof =====

    // ===== Retrieve the disclosed data =====

    /**
     * @notice Gets the data disclosed by the proof
     * @param committedInputs The committed inputs
     * @param isIDCard Whether the proof is an ID card
     * @return disclosedData The data disclosed by the proof
     */
    function getDisclosedData(
        bytes calldata committedInputs,
        bool isIDCard
    ) external pure returns (DisclosedData memory);

    // ===== Retrieve the bound data =====

    /**
     * @notice Gets the data bound to the proof
     * @param committedInputs The committed inputs
     * @return boundData The data bound to the proof
     */
    function getBoundData(
        bytes calldata committedInputs
    ) external pure returns (BoundData memory);

    // ===== Age verification =====

    /**
     * @notice Checks if the age is above or equal to the given age
     * @param minAge The age must be above or equal to this age
     * @param committedInputs The committed inputs
     * @return True if the age is above or equal to the given age, false otherwise
     */
    function isAgeAboveOrEqual(
        uint8 minAge,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the age is above the given age
     * @param minAge The age must be above this age
     * @param committedInputs The committed inputs
     * @return True if the age is above the given age, false otherwise
     */
    function isAgeAbove(
        uint8 minAge,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the age is in the given range
     * @param minAge The age must be greater than or equal to this age
     * @param maxAge The age must be less than or equal to this age
     * @param committedInputs The committed inputs
     * @return True if the age is in the given range, false otherwise
     */
    function isAgeBetween(
        uint8 minAge,
        uint8 maxAge,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the age is below or equal to the given age
     * @param maxAge The age must be below or equal to this age
     * @param committedInputs The committed inputs
     * @return True if the age is below or equal to the given age, false otherwise
     */
    function isAgeBelowOrEqual(
        uint8 maxAge,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the age is below the given age
     * @param maxAge The age must be below this age
     * @param committedInputs The committed inputs
     * @return True if the age is below the given age, false otherwise
     */
    function isAgeBelow(
        uint8 maxAge,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the age is equal to the given age
     * @param age The age must be equal to this age
     * @param committedInputs The committed inputs
     * @return True if the age is equal to the given age, false otherwise
     */
    function isAgeEqual(
        uint8 age,
        bytes calldata committedInputs
    ) external pure returns (bool);

    // ===== Birthdate comparison =====

    /**
     * @notice Checks if the birthdate is after or equal to the given date
     * @param minDate The birthdate must be after or equal to this date
     * @param committedInputs The committed inputs
     * @return True if the birthdate is after or equal to the given date, false otherwise
     */
    function isBirthdateAfterOrEqual(
        uint256 minDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the birthdate is after the given date
     * @param minDate The birthdate must be after this date
     * @param committedInputs The committed inputs
     * @return True if the birthdate is after the given date, false otherwise
     */
    function isBirthdateAfter(
        uint256 minDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the birthdate is between the given dates
     * @param minDate The birthdate must be after or equal to this date
     * @param maxDate The birthdate must be before or equal to this date
     * @param committedInputs The committed inputs
     * @return True if the birthdate is between the given dates, false otherwise
     */
    function isBirthdateBetween(
        uint256 minDate,
        uint256 maxDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the birthdate is before or equal to the given date
     * @param maxDate The birthdate must be before or equal to this date
     * @param committedInputs The committed inputs
     * @return True if the birthdate is before or equal to the given date, false otherwise
     */
    function isBirthdateBeforeOrEqual(
        uint256 maxDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the birthdate is before the given date
     * @param maxDate The birthdate must be before this date
     * @param committedInputs The committed inputs
     * @return True if the birthdate is before the given date, false otherwise
     */
    function isBirthdateBefore(
        uint256 maxDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the birthdate is equal to the given date
     * @param date The birthdate must be equal to this date
     * @param committedInputs The committed inputs
     * @return True if the birthdate is equal to the given date, false otherwise
     */
    function isBirthdateEqual(
        uint256 date,
        bytes calldata committedInputs
    ) external pure returns (bool);

    // ===== Expiry date comparison =====

    /**
     * @notice Checks if the expiry date is after or equal to the given date
     * @param minDate The expiry date must be after or equal to this date
     * @param committedInputs The committed inputs
     * @return True if the expiry date is after or equal to the given date, false otherwise
     */
    function isExpiryDateAfterOrEqual(
        uint256 minDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the expiry date is after the given date
     * @param minDate The expiry date must be after this date
     * @param committedInputs The committed inputs
     * @return True if the expiry date is after the given date, false otherwise
     */
    function isExpiryDateAfter(
        uint256 minDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the expiry date is between the given dates
     * @param minDate The expiry date must be after or equal to this date
     * @param maxDate The expiry date must be before or equal to this date
     * @param committedInputs The committed inputs
     * @return True if the expiry date is between the given dates, false otherwise
     */
    function isExpiryDateBetween(
        uint256 minDate,
        uint256 maxDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the expiry date is before or equal to the given date
     * @param maxDate The expiry date must be before or equal to this date
     * @param committedInputs The committed inputs
     * @return True if the expiry date is before or equal to the given date, false otherwise
     */
    function isExpiryDateBeforeOrEqual(
        uint256 maxDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the expiry date is before the given date
     * @param maxDate The expiry date must be before this date
     * @param committedInputs The committed inputs
     * @return True if the expiry date is before the given date, false otherwise
     */
    function isExpiryDateBefore(
        uint256 maxDate,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the expiry date is equal to the given date
     * @param date The expiry date must be equal to this date
     * @param committedInputs The committed inputs
     * @return True if the expiry date is equal to the given date, false otherwise
     */
    function isExpiryDateEqual(
        uint256 date,
        bytes calldata committedInputs
    ) external pure returns (bool);

    // ===== Country inclusion =====

    /**
     * @notice Checks if the nationality is in the list of countries
     * @param countryList The list of countries (needs to match exactly the list of countries in the proof)
     * @param committedInputs The committed inputs
     * @return True if the nationality is in the list of countries, false otherwise
     */
    function isNationalityIn(
        string[] memory countryList,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the issuing country is in the list of countries
     * @param countryList The list of countries (needs to match exactly the list of countries in the proof)
     * @param committedInputs The committed inputs
     * @return True if the issuing country is in the list of countries, false otherwise
     */
    function isIssuingCountryIn(
        string[] memory countryList,
        bytes calldata committedInputs
    ) external pure returns (bool);

    // ===== Country exclusion =====

    /**
     * @notice Checks if the nationality is not in the list of countries
     * @param countryList The list of countries (needs to match exactly the list of countries in the proof)
     * Note: The list of countries must be sorted in alphabetical order
     * @param committedInputs The committed inputs
     * @return True if the nationality is not in the list of countries, false otherwise
     */
    function isNationalityOut(
        string[] memory countryList,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Checks if the issuing country is not in the list of countries
     * @param countryList The list of countries (needs to match exactly the list of countries in the proof)
     * Note: The list of countries must be sorted in alphabetical order
     * @param committedInputs The committed inputs
     * @return True if the issuing country is not in the list of countries, false otherwise
     */
    function isIssuingCountryOut(
        string[] memory countryList,
        bytes calldata committedInputs
    ) external pure returns (bool);

    // ===== Sanction checks =====

    /**
     * @notice Checks if the sanctions root is valid against the expected sanction list(s)
     * Does not revert if the sanctions check fails but returns false instead.
     * @param currentTimestamp The current timestamp (preferably from the proof rather than the block timestamp).
     * This is used to check the validity of the sanctions root at that specific time.
     * @param isStrict Whether the sanctions check was strict or not
     * @param committedInputs The committed inputs
     * @return True if the sanctions root is valid against the expected sanction list(s), false otherwise
     */
    function isSanctionsRootValid(
        uint256 currentTimestamp,
        bool isStrict,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Enforces that the proof checks against the expected sanction list(s)
     * Reverts if the sanctions check fails
     * @param currentTimestamp The current timestamp (preferably from the proof rather than the block timestamp).
     * This is used to check the validity of the sanctions root at that specific time.
     * @param isStrict Whether the sanctions check was strict or not
     * @param committedInputs The committed inputs
     */
    function enforceSanctionsRoot(
        uint256 currentTimestamp,
        bool isStrict,
        bytes calldata committedInputs
    ) external view;

    /**
     * @notice Checks if the proof is tied to a FaceMatch verification
     * @param faceMatchMode The FaceMatch mode expected to be used in the verification
     * @param os The operating system on which the proof should have been generated (Any (0), iOS (1), Android (2))
     * @param committedInputs The committed inputs
     * @return True if the proof is tied to a valid FaceMatch verification, false otherwise
     */
    function isFaceMatchVerified(
        FaceMatchMode faceMatchMode,
        OS os,
        bytes calldata committedInputs
    ) external pure returns (bool);

    /**
     * @notice Gets the timestamp the proof was generated at
     * @param publicInputs The public inputs of the proof
     * @return The timestamp the proof was generated at
     */
    function getProofTimestamp(
        bytes32[] calldata publicInputs
    ) external pure returns (uint256);
}
