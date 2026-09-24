import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import Svg, { Path } from 'react-native-svg';

/**
 * PhoneJail-branded sign-in / sign-up against the shared Aadee Account
 * (production Clerk instance). Sign-in uses email one-time codes; first-time
 * users create a password (required by the instance) and then verify the same
 * email code. Google uses the browser SSO flow via useSSO().
 */

type Stage = 'email' | 'password' | 'code';
type CodeMode = 'signin' | 'signup';

// Preloads the browser on Android to reduce OAuth load time.
function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

export function AuthScreen() {
  useWarmUpBrowser();

  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [stage, setStage] = useState<Stage>('email');
  const [codeMode, setCodeMode] = useState<CodeMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  const busy = ssoBusy || signInStatus === 'fetching' || signUpStatus === 'fetching';

  const showError = (error: { code?: string; longMessage?: string; message?: string } | null | undefined) => {
    setFormError(error?.longMessage ?? error?.message ?? 'Something went wrong. Try again.');
  };

  const resetAll = async () => {
    setStage('email');
    setEmail('');
    setPassword('');
    setCode('');
    setFormError(null);
    setNotice(null);
    await signIn.reset();
    await signUp.reset();
  };

  const handleGoogle = async () => {
    setFormError(null);
    setSsoBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'phonejail', path: 'sso-callback' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
      // No session created = user cancelled; do nothing.
    } catch (error: any) {
      showError(error);
    } finally {
      setSsoBusy(false);
    }
  };

  const handleEmailContinue = async () => {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    setFormError(null);
    setNotice(null);

    const { error } = await signIn.emailCode.sendCode({ emailAddress: trimmed });
    if (!error) {
      setCodeMode('signin');
      setStage('code');
      return;
    }
    if (error.code === 'form_identifier_not_found') {
      // No Aadee Account yet — collect a password (required by the instance)
      // and move to the sign-up path.
      setCodeMode('signup');
      setStage('password');
      return;
    }
    showError(error);
  };

  const handlePasswordContinue = async () => {
    if (!password || busy) return;
    setFormError(null);

    const { error } = await signUp.password({ emailAddress: email.trim(), password });
    if (error) {
      if (error.code === 'form_identifier_exists') {
        // Account appeared between attempts — fall back to sign-in code.
        const resend = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
        if (!resend.error) {
          setCodeMode('signin');
          setStage('code');
          setNotice('An account already exists for this email. We sent a sign-in code instead.');
          return;
        }
      }
      showError(error);
      return;
    }

    const send = await signUp.verifications.sendEmailCode();
    if (send.error) {
      showError(send.error);
      return;
    }
    setStage('code');
  };

  const handleVerify = async () => {
    if (!code || busy) return;
    setFormError(null);

    if (codeMode === 'signin') {
      const { error } = await signIn.emailCode.verifyCode({ code });
      if (error) {
        showError(error);
        return;
      }
      const fin = await signIn.finalize();
      if (fin.error) showError(fin.error);
    } else {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) {
        showError(error);
        return;
      }
      const fin = await signUp.finalize();
      if (fin.error) showError(fin.error);
    }
  };

  const handleResend = async () => {
    setFormError(null);
    const res =
      codeMode === 'signin'
        ? await signIn.emailCode.sendCode({ emailAddress: email.trim() })
        : await signUp.verifications.sendEmailCode();
    if (res.error) showError(res.error);
    else setNotice('A new code is on its way.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>PhoneJail</Text>
        </View>

        <Text style={styles.headline}>Lock in.</Text>
        <Text style={styles.headlineSub}>Stay focused.</Text>

        {stage === 'email' && (
          <View style={styles.card}>
            <Pressable
              onPress={handleGoogle}
              disabled={busy}
              style={({ pressed }) => [styles.googleButton, pressed && styles.pressed, busy && styles.dimmed]}
            >
              {ssoBusy ? (
                <ActivityIndicator color="#1f1f1f" />
              ) : (
                <>
                  <GoogleLogo />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="rgba(255,255,255,0.35)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
            />

            {formError && <Text style={styles.error}>{formError}</Text>}

            <Pressable
              onPress={handleEmailContinue}
              disabled={busy || !email.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (busy || !email.trim()) && styles.dimmed,
              ]}
            >
              {signInStatus === 'fetching' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue</Text>
              )}
            </Pressable>
          </View>
        )}

        {stage === 'password' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create your Aadee Account</Text>
            <Text style={styles.cardHint}>
              {email.trim()} — set a password to finish signing up.
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password (8+ characters)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              secureTextEntry
              autoComplete="new-password"
            />

            {formError && <Text style={styles.error}>{formError}</Text>}

            <Pressable
              onPress={handlePasswordContinue}
              disabled={busy || password.length < 8}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (busy || password.length < 8) && styles.dimmed,
              ]}
            >
              {signUpStatus === 'fetching' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue</Text>
              )}
            </Pressable>

            <Pressable onPress={resetAll} style={styles.linkButton} hitSlop={8}>
              <Text style={styles.linkText}>‹ Use a different email</Text>
            </Pressable>
          </View>
        )}

        {stage === 'code' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Check your email</Text>
            <Text style={styles.cardHint}>
              We sent a 6-digit code to {email.trim()}
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={setCode}
              placeholder="••••••"
              placeholderTextColor="rgba(255,255,255,0.35)"
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
            />

            {notice && <Text style={styles.notice}>{notice}</Text>}
            {formError && <Text style={styles.error}>{formError}</Text>}

            <Pressable
              onPress={handleVerify}
              disabled={busy || code.length < 6}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (busy || code.length < 6) && styles.dimmed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify</Text>
              )}
            </Pressable>

            <View style={styles.codeFooter}>
              <Pressable onPress={handleResend} style={styles.linkButton} hitSlop={8}>
                <Text style={styles.linkText}>Resend code</Text>
              </Pressable>
              <Pressable onPress={resetAll} style={styles.linkButton} hitSlop={8}>
                <Text style={styles.linkText}>‹ Back</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.footnote}>One Aadee Account works across supported apps.</Text>

        {/* Required for sign-up flows on Expo web. No-op on iOS/Android. */}
        <View nativeID="clerk-captcha" />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#060c16',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E9DFF',
    marginRight: 10,
    shadowColor: '#2E9DFF',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  brand: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8A9CB0',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 40,
  },
  headlineSub: {
    fontSize: 34,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: 32,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(46,157,255,0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,157,255,0.14)',
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 6,
  },
  cardHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f1f1f',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(46,157,255,0.2)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 14,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 8,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#2E9DFF',
    shadowColor: '#2E9DFF',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.85,
  },
  dimmed: {
    opacity: 0.5,
  },
  error: {
    color: '#ff7a90',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  notice: {
    color: '#6fd6a7',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  linkButton: {
    alignSelf: 'center',
    marginTop: 14,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  codeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footnote: {
    marginTop: 24,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
});
