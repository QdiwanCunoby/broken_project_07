// Confronto con il Bug 2: con il pattern Service/Repository del G5 il mock si passa al COSTRUTTORE.
// Niente jest.mock, niente hoisting, niente forma di PrismaClient da ricostruire: basta un oggetto che rispetta
// IAccountRepository, e TypeScript verifica che sia "sagomato" giusto.
import { AccountService } from "../../src/modules/account/account.service";
import { IAccountRepository } from "../../src/modules/account/account.repository";
import { Account, AccountStatus, AccountType } from "../../src/modules/account/account.types";
import { ConflictError, NotFoundError } from "../../src/utils/errors";

const account: Account = {
  id: "a1", ownerId: "c1", iban: "IT60X0542811101000000123456", type: AccountType.CHECKING,
  balance: "1000.00", status: AccountStatus.ACTIVE, createdAt: new Date(0), updatedAt: new Date(0),
};

const mockRepository = (overrides: Partial<jest.Mocked<IAccountRepository>> = {}): jest.Mocked<IAccountRepository> => ({
  findAll: jest.fn().mockResolvedValue([account]),
  findById: jest.fn().mockResolvedValue(account),
  findByIban: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue(account),
  update: jest.fn().mockResolvedValue(account),
  delete: jest.fn().mockResolvedValue(true),
  ...overrides,
});

describe("AccountService (unit, repository iniettato)", () => {
  it("getAllAccounts delega al repository", async () => {
    const repo = mockRepository();
    await expect(new AccountService(repo).getAllAccounts()).resolves.toEqual([account]);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });

  it("getAccountById → NotFoundError se il repository non trova nulla", async () => {
    const repo = mockRepository({ findById: jest.fn().mockResolvedValue(null) });
    await expect(new AccountService(repo).getAccountById("x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("createAccount → ConflictError se l'IBAN esiste, e non chiama create", async () => {
    const repo = mockRepository({ findByIban: jest.fn().mockResolvedValue(account) });
    const dto = { ownerId: "c1", iban: account.iban, type: AccountType.CHECKING, initialBalance: 0 };
    await expect(new AccountService(repo).createAccount(dto)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
