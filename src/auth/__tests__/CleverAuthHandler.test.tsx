import ApplicationError from "errors";
import * as React from "react";
import { fixtures, screen, setup, waitFor } from "test-utils";
import CleverAuthHandler from "../CleverAuthHandler";
import { navigateToUrl } from "utils/navigation";

jest.mock("utils/navigation", () => ({
  navigateToUrl: jest.fn()
}));

const mockNavigateToUrl = navigateToUrl as jest.MockedFunction<
  typeof navigateToUrl
>;

test("shows loader while redirecting", () => {
  setup(<CleverAuthHandler method={fixtures.cleverAuthMethod} />);
  expect(screen.getByText("Logging in with Clever...")).toBeInTheDocument();
});

beforeEach(() => mockNavigateToUrl.mockClear());

test("redirects to proper auth url", async () => {
  setup(<CleverAuthHandler method={fixtures.cleverAuthMethod} />, {
    user: { token: undefined }
  });
  await waitFor(() => {
    expect(mockNavigateToUrl).toHaveBeenCalledWith(
      "https://example.com/oauth_authenticate?provider=Clever&redirect_uri=http%253A%252F%252Ftest-domain.com%252Ftestlib"
    );
  });
});

test("does not redirect if there is a token present", () => {
  setup(<CleverAuthHandler method={fixtures.cleverAuthMethod} />, {
    user: { token: "something" }
  });
  expect(mockNavigateToUrl).not.toHaveBeenCalled();
});

test("throws error if there is no authenticate link in library data", async () => {
  try {
    // do nothing
  } catch {
    // catching this error resolves console.error thrown from absence of ErrorBoundary
    expect(() =>
      setup(
        <CleverAuthHandler
          method={{ ...fixtures.cleverAuthMethod, links: [] }}
        />
      )
    ).toThrowError(ApplicationError);
  }
});
