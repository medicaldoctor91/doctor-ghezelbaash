# Firebase Deploy Diagnostic

started_at=2026-06-24T17:29:09Z
repository=medicaldoctor91/doctor-ghezelbaash
ref=refs/heads/main
sha=6b957634f321a5ec1bd146516d4b84b306f4500a

## Google Auth
auth_outcome=failure
auth_conclusion=success

GOOGLE_APPLICATION_CREDENTIALS=/home/runner/work/doctor-ghezelbaash/doctor-ghezelbaash/gha-creds-6f7566dd3f19e389.json
GOOGLE_GHA_CREDS_PATH=/home/runner/work/doctor-ghezelbaash/doctor-ghezelbaash/gha-creds-6f7566dd3f19e389.json
## gcloud Test
gcloud version:
Google Cloud SDK 568.0.0
bq 2.1.31
bundled-python3-unix 3.14.4
core 2026.05.08
gcloud-crc32c 1.0.0
gsutil 5.37
Updates are available for some Google Cloud CLI components.  To install them,
please run:
  $ gcloud components update

gcloud auth list:
                        Credentialed Accounts
ACTIVE  ACCOUNT
*       github-firebase-hosting@ghezelbaash-kg.iam.gserviceaccount.com

To set the active account, run:
    $ gcloud config set account `ACCOUNT`


Trying to get access token...
DEBUG: Running [gcloud.auth.print-access-token] with arguments: [--verbosity: "debug"]
INFO: Using alternate credentials from file: [/home/runner/work/doctor-ghezelbaash/doctor-ghezelbaash/gha-creds-6f7566dd3f19e389.json]
DEBUG: On GCE from disk cache: False
DEBUG: Starting new HTTPS connection (1): run-actions-3-azure-eastus.actions.githubusercontent.com:443
DEBUG: https://run-actions-3-azure-eastus.actions.githubusercontent.com:443 "GET /68//idtoken/cc0a4f83-5c96-42e2-8072-7c6f1e236c9e/ec3d1a0e-a29e-5526-b11c-cafc273fd1a7?api-version=2.0&audience=https%3A%2F%2Fiam.googleapis.com%2Fprojects%2F71850730043%2Flocations%2Fglobal%2FworkloadIdentityPools%2Fgithub-actions%2Fproviders%2Fdoctor-ghezelbaash HTTP/1.1" 200 None
DEBUG: Starting new HTTPS connection (1): sts.googleapis.com:443
DEBUG: https://sts.googleapis.com:443 "POST /v1/token HTTP/1.1" 400 None
DEBUG: (gcloud.auth.print-access-token) ('Error code invalid_target: The target service indicated by the "audience" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist.', '{"error":"invalid_target","error_description":"The target service indicated by the \\"audience\\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist."}')
Traceback (most recent call last):
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/calliope/exceptions.py", line 138, in TryFunc
    return func(*args, **kwargs)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/surface/auth/print_access_token.py", line 176, in Run
    cred = auth_command_util.LoadCredentialsWithScopes(
        account=args.account,
    ...<2 lines>...
        impersonation_lifetime=args.lifetime,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/command_lib/auth/auth_util.py", line 76, in LoadCredentialsWithScopes
    cred = c_store.Load(
        account,
        allow_account_impersonation=True,
        cache_only_rapt=cache_only_rapt,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 825, in Load
    cred = _Load(
        account,
    ...<2 lines>...
        cache_only_rapt=cache_only_rapt,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1000, in _Load
    RefreshIfAlmostExpire(cred, for_adc=for_adc)
    ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1263, in RefreshIfAlmostExpire
    RefreshIfExpireWithinWindow(
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^
        credentials, window=_CREDENTIALS_EXPIRY_WINDOW, for_adc=for_adc
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1259, in RefreshIfExpireWithinWindow
    Refresh(credentials, for_adc=for_adc)
    ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1079, in Refresh
    credentials.refresh(request_client)
    ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/creds.py", line 787, in _WrappedRefresh
    orig_refresh(request)
    ~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/identity_pool.py", line 574, in refresh
    self._perform_refresh_token(request, cert_fingerprint=cert_fingerprint)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/external_account.py", line 465, in _perform_refresh_token
    self._impersonated_credentials.refresh(request)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/credentials.py", line 474, in refresh
    self._perform_refresh_token(request)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/impersonated_credentials.py", line 295, in _perform_refresh_token
    self._source_credentials.refresh(request)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/identity_pool.py", line 574, in refresh
    self._perform_refresh_token(request, cert_fingerprint=cert_fingerprint)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/external_account.py", line 487, in _perform_refresh_token
    response_data = self._sts_client.exchange_token(
        request=request,
    ...<7 lines>...
        additional_headers=additional_headers,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/oauth2/sts.py", line 165, in exchange_token
    return self._make_request(request, additional_headers, request_body)
           ~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/oauth2/sts.py", line 91, in _make_request
    utils.handle_error_response(response_body)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/oauth2/utils.py", line 168, in handle_error_response
    raise exceptions.OAuthError(error_details, response_body)
google.auth.exceptions.OAuthError: ('Error code invalid_target: The target service indicated by the "audience" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist.', '{"error":"invalid_target","error_description":"The target service indicated by the \\"audience\\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist."}')

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/calliope/cli.py", line 941, in Execute
    resources = calliope_command.Run(cli=self, args=args)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/calliope/backend.py", line 968, in Run
    resources = command_instance.Run(args)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/calliope/exceptions.py", line 140, in TryFunc
    core_exceptions.reraise(NewErrorFromCurrentException(error))
    ~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/exceptions.py", line 146, in reraise
    six.reraise(type(exc_value), exc_value, tb)
    ~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/six/__init__.py", line 718, in reraise
    raise value.with_traceback(tb)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/calliope/exceptions.py", line 138, in TryFunc
    return func(*args, **kwargs)
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/surface/auth/print_access_token.py", line 176, in Run
    cred = auth_command_util.LoadCredentialsWithScopes(
        account=args.account,
    ...<2 lines>...
        impersonation_lifetime=args.lifetime,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/command_lib/auth/auth_util.py", line 76, in LoadCredentialsWithScopes
    cred = c_store.Load(
        account,
        allow_account_impersonation=True,
        cache_only_rapt=cache_only_rapt,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 825, in Load
    cred = _Load(
        account,
    ...<2 lines>...
        cache_only_rapt=cache_only_rapt,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1000, in _Load
    RefreshIfAlmostExpire(cred, for_adc=for_adc)
    ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1263, in RefreshIfAlmostExpire
    RefreshIfExpireWithinWindow(
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^
        credentials, window=_CREDENTIALS_EXPIRY_WINDOW, for_adc=for_adc
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1259, in RefreshIfExpireWithinWindow
    Refresh(credentials, for_adc=for_adc)
    ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/store.py", line 1079, in Refresh
    credentials.refresh(request_client)
    ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/googlecloudsdk/core/credentials/creds.py", line 787, in _WrappedRefresh
    orig_refresh(request)
    ~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/identity_pool.py", line 574, in refresh
    self._perform_refresh_token(request, cert_fingerprint=cert_fingerprint)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/external_account.py", line 465, in _perform_refresh_token
    self._impersonated_credentials.refresh(request)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/credentials.py", line 474, in refresh
    self._perform_refresh_token(request)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/impersonated_credentials.py", line 295, in _perform_refresh_token
    self._source_credentials.refresh(request)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/identity_pool.py", line 574, in refresh
    self._perform_refresh_token(request, cert_fingerprint=cert_fingerprint)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/auth/external_account.py", line 487, in _perform_refresh_token
    response_data = self._sts_client.exchange_token(
        request=request,
    ...<7 lines>...
        additional_headers=additional_headers,
    )
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/oauth2/sts.py", line 165, in exchange_token
    return self._make_request(request, additional_headers, request_body)
           ~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/oauth2/sts.py", line 91, in _make_request
    utils.handle_error_response(response_body)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^
  File "/opt/hostedtoolcache/gcloud/568.0.0/x64/lib/third_party/google/oauth2/utils.py", line 168, in handle_error_response
    raise exceptions.OAuthError(error_details, response_body)
googlecloudsdk.api_lib.auth.exceptions.AuthenticationError: ('Error code invalid_target: The target service indicated by the "audience" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist.', '{"error":"invalid_target","error_description":"The target service indicated by the \\"audience\\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist."}')
ERROR: (gcloud.auth.print-access-token) ('Error code invalid_target: The target service indicated by the "audience" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist.', '{"error":"invalid_target","error_description":"The target service indicated by the \\"audience\\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn\'t exist."}')
exit_code=0
